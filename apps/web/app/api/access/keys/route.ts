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

const API_KEY_VALUE_PREFIX = "td:apikey:";
const API_KEY_INDEX_PREFIX = "td:apikeys:";

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
  // Auth is optional for POST — the dashboard UI generates keys without a session JWT.
  // If a valid JWT is present we bind the key to that session; otherwise we accept a
  // sessionId in the body (agent secret path) or create a fresh anonymous session.
  const auth = await authenticateRequest(request);

  const body = await parseBody(request);
  const redis = getRedis();

  let sessionId: string;

  if (auth.ok) {
    sessionId = auth.claims.sessionId;
  } else if (body && typeof body.sessionId === "string" && body.sessionId) {
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

  await redis.set(`${API_KEY_VALUE_PREFIX}${apiKey}`, sessionId);

  const indexKey = `${API_KEY_INDEX_PREFIX}${sessionId}`;
  await redis.sadd(indexKey, apiKey);

  return jsonOk({
    apiKey,
    label: keyLabel(apiKey),
    createdAt: now,
    sessionId,
  });
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

  const redis = getRedis();
  const indexKey = `${API_KEY_INDEX_PREFIX}${sessionId}`;
  const keys = await redis.smembers(indexKey);

  const items = (keys ?? []).map((key: string) => ({
    label: keyLabel(key),
    createdAt: "",
  }));

  return jsonOk({ keys: items, total: items.length });
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
  const redis = getRedis();

  const sessionId = await redis.get(`${API_KEY_VALUE_PREFIX}${apiKey}`);
  if (!sessionId || typeof sessionId !== "string") {
    return jsonError(ErrorCode.UNAUTHORIZED, "API key not found");
  }

  const indexKey = `${API_KEY_INDEX_PREFIX}${sessionId}`;
  await redis.srem(indexKey, apiKey);

  await redis.del(`${API_KEY_VALUE_PREFIX}${apiKey}`);

  return jsonOk({ revoked: apiKey });
}
