import type { NextRequest, NextResponse } from "next/server";
import { ErrorCode, type ApiResponse, type SignalingPayload } from "@tetherdesk/protocol";
import { jsonError, jsonOk, parseJsonBody, getClientIp } from "@/lib/http";
import { checkPollingRateLimit } from "@/lib/rateLimit";
import { signalPollQuerySchema } from "@/lib/validation";
import { authenticateRequest } from "@/lib/auth";
import { drainMailbox, pushToMailbox } from "@/lib/mailbox";

export const runtime = "nodejs";
// Long-poll fallback for WebSocket signaling (Section 7.3). Completes immediately if
// messages are already queued, or after a short timeout (streaming response pattern).
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<SignalingPayload[]>>> {
  const ip = getClientIp(request);
  const rateLimit = await checkPollingRateLimit(ip, "signal-poll");
  if (!rateLimit.allowed) {
    return jsonError(ErrorCode.RATE_LIMITED, "Too many requests");
  }

  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return jsonError(ErrorCode.UNAUTHORIZED, "invalid or missing bearer token");
  }

  const { searchParams } = new URL(request.url);
  const parsed = signalPollQuerySchema.safeParse({
    sessionId: searchParams.get("sessionId"),
    recipient: searchParams.get("recipient"),
  });

  if (!parsed.success) {
    return jsonError(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message ?? "invalid query parameters");
  }

  const { sessionId, recipient } = parsed.data;

  // Verify the session ID in the token matches the requested session
  if (auth.claims.sessionId !== sessionId) {
    return jsonError(ErrorCode.UNAUTHORIZED, "session mismatch");
  }

  // Verify the recipient matches the token's role
  if (auth.claims.role !== recipient) {
    return jsonError(ErrorCode.UNAUTHORIZED, "recipient mismatch");
  }

  try {
    const messages = await drainMailbox(sessionId, recipient);
    return jsonOk(messages as SignalingPayload[], 200);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "signal_poll_failed",
        sessionId,
        recipient,
        errorType: error instanceof Error ? error.name : "unknown",
      }),
    );
    return jsonError(ErrorCode.STORE_UNAVAILABLE, "failed to retrieve signaling messages");
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<{ queued: boolean }>>> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return jsonError(ErrorCode.UNAUTHORIZED, "invalid or missing bearer token");
  }

  const body = await parseJsonBody(request);
  
  // Validate the envelope structure
  if (!body || typeof body !== "object") {
    return jsonError(ErrorCode.VALIDATION_FAILED, "request body must be an object");
  }

  const { sessionId, recipient, payload } = body as {
    sessionId?: unknown;
    recipient?: unknown;
    payload?: unknown;
  };

  if (typeof sessionId !== "string" || typeof recipient !== "string") {
    return jsonError(ErrorCode.VALIDATION_FAILED, "sessionId and recipient must be strings");
  }

  // Verify the session ID matches the token
  if (auth.claims.sessionId !== sessionId) {
    return jsonError(ErrorCode.UNAUTHORIZED, "session mismatch");
  }

  // Verify sender is not the same as recipient (can't send to yourself)
  if (auth.claims.role === recipient) {
    return jsonError(ErrorCode.VALIDATION_FAILED, "cannot send message to yourself");
  }

  // Validate recipient is valid
  if (recipient !== "laptop" && recipient !== "phone") {
    return jsonError(ErrorCode.VALIDATION_FAILED, "recipient must be 'laptop' or 'phone'");
  }

  // Basic payload validation (Section 7.2: size/type for abuse prevention only)
  if (!payload || typeof payload !== "object") {
    return jsonError(ErrorCode.VALIDATION_FAILED, "payload must be an object");
  }

  const payloadStr = JSON.stringify(payload);
  if (payloadStr.length > 64 * 1024) {
    return jsonError(ErrorCode.VALIDATION_FAILED, "payload exceeds 64KB limit");
  }

  // A peer must not be able to write to its own mailbox — only to the other side's.
  // laptop token → may only send to "phone" mailbox; phone token → may only send to "laptop".
  const senderRole = auth.claims.role; // "laptop" | "phone"
  const expectedRecipient = senderRole === "laptop" ? "phone" : "laptop";
  if (recipient !== expectedRecipient) {
    return jsonError(
      ErrorCode.VALIDATION_FAILED,
      `role '${senderRole}' may only send to '${expectedRecipient}' mailbox`,
    );
  }

  try {
    await pushToMailbox(sessionId, recipient, payload);
    return jsonOk({ queued: true }, 200);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "signal_post_failed",
        sessionId,
        recipient,
        errorType: error instanceof Error ? error.name : "unknown",
      }),
    );
    return jsonError(ErrorCode.STORE_UNAVAILABLE, "failed to queue signaling message");
  }
}
