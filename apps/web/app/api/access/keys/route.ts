import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ErrorCode } from "@tetherdesk/protocol";
import { getRedis } from "@/lib/redis";
import { redisKeys } from "@/lib/keys";
import { randomBytes } from "node:crypto";
import { generateSessionId } from "@/lib/ids";
import { authenticateRequest, verifyAgentSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 10;



function jsonOk(data: Record<string, unknown>) {
  return NextResponse.json({ ok: true, data });
}

function jsonError(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/** Parse a JSON body safely. */
async function parseBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return body;
  } catch {
    return null;
  }
}

/** Generate a persistent API key: sk- + 32 random hex chars = 35 chars total. */
function generateApiKey(): string {
  return `sk-${randomBytes(16).toString("hex")}`;
}

/** Key identifier for display (first 12 chars + "..."). */
function keyLabel(key: string): string {
  if (key.length <= 15) return key;
  return `${key.slice(0, 12)}...`;
}

// ---------------------------------------------------------------------------
// POST /api/access/keys — create a new API key
// Body: { sessionId?: string }
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);

  // Require authentication: either a valid laptop JWT or the agent secret.
  // Without this check, anyone on the internet can call POST /api/access/keys
  // and get a persistent API key tied to a new anonymous session — bypassing
  // the entire pairing flow and gaining permanent dashboard access.
  if (!auth.ok && !verifyAgentSecret(request)) {
    return jsonError(ErrorCode.UNAUTHORIZED, "authentication required", 401);
  }

  const body = await parseBody(request);

  try {
    const redis = getRedis();

    let sessionId: string;

    if (auth.ok) {
      sessionId = auth.claims.sessionId;
    } else if (body && typeof body.sessionId === "string" && body.sessionId) {
      // Agent secret path: accept sessionId from body (used by agent provisioning)
      sessionId = body.sessionId;
      const sessionKey = redisKeys.session(sessionId);
      const exists = await redis.exists(sessionKey);
      if (!exists) {
        sessionId = generateSessionId();
        const now = Date.now();
        await redis.hset(redisKeys.session(sessionId), {
          state: "pending",
          createdAt: now,
          lastActiveAt: now,
        });
      }
    } else {
      sessionId = generateSessionId();
      const now = Date.now();
      await redis.hset(redisKeys.session(sessionId), {
        state: "pending",
        createdAt: now,
        lastActiveAt: now,
      });
    }

    const apiKey = generateApiKey();
    const now = new Date().toISOString();

    await redis.set(redisKeys.apiKey(apiKey), sessionId);

    const indexKey = redisKeys.apiKeysIndex(sessionId);
    await redis.sadd(indexKey, apiKey);

    return jsonOk({
      apiKey,
      label: keyLabel(apiKey),
      createdAt: now,
      sessionId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "api_key_create_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return jsonError(ErrorCode.STORE_UNAVAILABLE, "service unavailable — please try again later", 503);
  }
}

// ---------------------------------------------------------------------------
// GET /api/access/keys?sessionId=xxx — list all keys for a session
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.ok && !verifyAgentSecret(request)) {
    return jsonError(ErrorCode.UNAUTHORIZED, "authentication required");
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return jsonError(ErrorCode.VALIDATION_FAILED, "sessionId query parameter is required");
  }
  if (sessionId.length > 128) {
    return jsonError(ErrorCode.VALIDATION_FAILED, "sessionId exceeds maximum length");
  }

  try {
    const redis = getRedis();
    const indexKey = redisKeys.apiKeysIndex(sessionId);
    const keys = await redis.smembers(indexKey);

    const items = (keys ?? []).map((key: string) => ({
      label: keyLabel(key),
      createdAt: "",
    }));

    return jsonOk({ keys: items, total: items.length });
  } catch (error) {
    console.error(JSON.stringify({ event: "api_key_list_failed", sessionId, errorType: error instanceof Error ? error.name : "unknown" }));
    return jsonError(ErrorCode.STORE_UNAVAILABLE, "service unavailable — please try again later", 503);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/access/keys — revoke an API key
// Body: { apiKey: string }
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.ok && !verifyAgentSecret(request)) {
    return jsonError(ErrorCode.UNAUTHORIZED, "authentication required");
  }

  const body = await parseBody(request);
  if (!body || typeof body.apiKey !== "string" || !body.apiKey) {
    return jsonError(ErrorCode.VALIDATION_FAILED, "apiKey is required");
  }

  const { apiKey } = body;

  // Validate format before using as a Redis key to prevent injection
  if (!/^sk-[0-9a-f]{32}$/i.test(apiKey)) {
    return jsonError(ErrorCode.VALIDATION_FAILED, "Invalid API key format");
  }

  try {
    const redis = getRedis();

    const sessionId = await redis.get(redisKeys.apiKey(apiKey));
    if (!sessionId || typeof sessionId !== "string") {
      return jsonError(ErrorCode.UNAUTHORIZED, "API key not found");
    }

    const indexKey = redisKeys.apiKeysIndex(sessionId);
    await redis.srem(indexKey, apiKey);
    await redis.del(redisKeys.apiKey(apiKey));

    return jsonOk({ revoked: apiKey });
  } catch (error) {
    console.error(JSON.stringify({ event: "api_key_revoke_failed", apiKey, errorType: error instanceof Error ? error.name : "unknown" }));
    return jsonError(ErrorCode.STORE_UNAVAILABLE, "service unavailable — please try again later", 503);
  }
}
