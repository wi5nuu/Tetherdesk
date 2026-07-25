import type { NextRequest } from "next/server";
import { ErrorCode, type ApiResponse } from "@tetherdesk/protocol";
import { authenticateRequest } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { redisKeys } from "@/lib/keys";
// BUG-18: hoisted from inside the hot WS message handler — dynamic import() inside
// an event listener runs module resolution on every message, adding latency.
import { drainMailbox, pushToMailbox } from "@/lib/mailbox";
import { updateSessionRecord } from "@/lib/pairingStore";

export const runtime = "nodejs";
// WebSocket upgrade handler for native Vercel Functions WebSocket beta.
// Clients auto-fall-back to /api/signal/poll if the WS upgrade is rejected.
// maxDuration controls how long a single WS invocation can live before the
// client must reconnect; state is in Redis so reconnect is transparent.
export const maxDuration = 60;

/**
 * GET is used by non-WS clients to confirm the signaling endpoint is reachable.
 * A 426 response signals to the client that it should upgrade to WebSocket.
 * The actual WS upgrade is handled by Vercel's runtime via the SOCKET export below.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const upgradeHeader = request.headers.get("upgrade");

  if (upgradeHeader?.toLowerCase() !== "websocket") {
    // Not a WS request — return 426 to tell the client to upgrade
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "This endpoint requires a WebSocket upgrade. Use /api/signal/poll for HTTP long-polling.",
          retryable: false,
        },
      } satisfies ApiResponse<never>),
      {
        status: 426,
        headers: {
          "Content-Type": "application/json",
          Upgrade: "websocket",
        },
      },
    );
  }

  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: ErrorCode.UNAUTHORIZED, message: "Unauthorized", retryable: false } }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { sessionId, role } = auth.claims;
  const redis = getRedis();
  const sessionData = await redis.hgetall<Record<string, string>>(redisKeys.session(sessionId));

  if (!sessionData) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: ErrorCode.SESSION_NOT_FOUND, message: "Session not found", retryable: false } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Check device revocation before upgrading.
  // deviceIdToCheck may be undefined if the session record was created before the phone
  // confirmed (pending state) — skip the revocation check in that case rather than blocking.
  const deviceIdToCheck = role === "laptop" ? sessionData["laptopPubKey"] : sessionData["phonePubKey"];
  if (deviceIdToCheck !== undefined && deviceIdToCheck !== "") {
    const isRevoked = await redis.exists(redisKeys.revoked(deviceIdToCheck));
    if (isRevoked) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: ErrorCode.DEVICE_REVOKED, message: "Device revoked", retryable: false } }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // Signal to Vercel's WS runtime that this upgrade is authorized.
  // The actual socket message handling is done in the SOCKET export below.
  // Vercel's beta runtime intercepts the 101 and wires up the SOCKET handler.
  return new Response(null, { status: 101 });
}

/**
 * SOCKET export — called by Vercel's native WebSocket beta runtime after a
 * successful upgrade. `socket` is a standard WebSocket server-side handle.
 *
 * NOTE: Vercel's WS beta runtime is responsible for calling this function after
 * the GET handler returns 101. If the beta runtime is not available (e.g. on
 * preview or older deployments), clients fall back to /api/signal/poll
 * automatically after 2 consecutive upgrade failures.
 */
export async function SOCKET(
  client: WebSocket,
  request: NextRequest,
  _server: unknown,
): Promise<void> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    client.close(4001, "Unauthorized");
    return;
  }

  const { sessionId, role } = auth.claims;
  const redis = getRedis();

  // BUG-S1: the GET handler checks revocation before upgrading, but the SOCKET
  // handler (called by Vercel's runtime after the upgrade) must repeat the
  // check independently — a device could be revoked in the milliseconds between
  // the GET 101 response and the SOCKET invocation, or the GET path could be
  // bypassed entirely in future Vercel runtime versions.
  const sessionData = await redis.hgetall<Record<string, string>>(redisKeys.session(sessionId));
  if (!sessionData) {
    client.close(4002, "Session not found");
    return;
  }
  const deviceIdToCheck = role === "laptop" ? sessionData["laptopPubKey"] : sessionData["phonePubKey"];
  if (deviceIdToCheck !== undefined && deviceIdToCheck !== "") {
    const isRevoked = await redis.exists(redisKeys.revoked(deviceIdToCheck));
    if (isRevoked) {
      client.close(4003, "Device revoked");
      return;
    }
  }

  // Log connection
  console.log(JSON.stringify({ event: "ws_connected", sessionId, role }));

  // Drain any queued messages immediately on connect
  try {
    await updateSessionRecord(sessionId, { lastActiveAt: Date.now() });

    const messages = await drainMailbox(sessionId, role);
    for (const msg of messages) {
      client.send(JSON.stringify(msg));
    }
  } catch (err) {
    console.error(JSON.stringify({ event: "ws_drain_failed", sessionId, role, error: String(err) }));
  }

  client.addEventListener("message", async (evt: MessageEvent) => {
    try {
      const raw = typeof evt.data === "string" ? evt.data : new TextDecoder().decode(evt.data as ArrayBuffer);
      const envelope = JSON.parse(raw) as { recipient?: unknown; payload?: unknown };

      if (!envelope || typeof envelope !== "object") {
        client.send(JSON.stringify({ error: { code: ErrorCode.VALIDATION_FAILED, message: "body must be an object" } }));
        return;
      }

      const { recipient, payload } = envelope;

      if (recipient !== "laptop" && recipient !== "phone") {
        client.send(JSON.stringify({ error: { code: ErrorCode.VALIDATION_FAILED, message: "recipient must be laptop or phone" } }));
        return;
      }

      if (recipient === role) {
        client.send(JSON.stringify({ error: { code: ErrorCode.VALIDATION_FAILED, message: "cannot send to yourself" } }));
        return;
      }

      if (!payload || typeof payload !== "object") {
        client.send(JSON.stringify({ error: { code: ErrorCode.VALIDATION_FAILED, message: "payload must be an object" } }));
        return;
      }

      // BUG-S2: recipient is already validated as "laptop" | "phone" above,
      // so the cast is safe — but be explicit about it rather than silently
      // widening to `string` which would allow arbitrary mailbox keys.
      const validatedRecipient = recipient as "laptop" | "phone";

      // BUG-S3: re-serializing `payload` (which was parsed from `raw`) to
      // measure its size is correct — we must NOT measure `raw.length` because
      // `raw` includes the `recipient` wrapper and any extra whitespace from
      // the client, which would give a different (larger) number than the
      // payload alone that actually gets pushed to the mailbox.
      const payloadJson = JSON.stringify(payload);
      if (payloadJson.length > 64 * 1024) {
        client.send(JSON.stringify({ error: { code: ErrorCode.VALIDATION_FAILED, message: "payload exceeds 64KB" } }));
        return;
      }

      await pushToMailbox(sessionId, validatedRecipient, payload as Parameters<typeof pushToMailbox>[2]);
      await updateSessionRecord(sessionId, { lastActiveAt: Date.now() });
      client.send(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error(JSON.stringify({ event: "ws_message_error", sessionId, role, error: String(err) }));
      client.send(JSON.stringify({ error: { code: ErrorCode.INTERNAL_ERROR, message: "internal error" } }));
    }
  });

  client.addEventListener("close", () => {
    console.log(JSON.stringify({ event: "ws_closed", sessionId, role }));
  });

  client.addEventListener("error", (evt: Event) => {
    console.error(JSON.stringify({ event: "ws_error", sessionId, role, error: String(evt) }));
  });
}
