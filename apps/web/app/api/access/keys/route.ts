import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ErrorCode } from "@tetherdesk/protocol";
import { getRedis } from "@/lib/redis";
import { redisKeys } from "@/lib/keys";
import { randomBytes } from "node:crypto";
import { generateSessionId } from "@/lib/ids";

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
  const body = await parseBody(request);
  const redis = getRedis();

  let sessionId: string;

  if (body && typeof body.sessionId === "string" && body.sessionId) {
    sessionId = body.sessionId;
    // Verify the session exists (but don't require bearerToken — API keys
    // are self-authenticating and work independently of any agent session)
    const sessionKey = redisKeys.session(sessionId);
    const exists = await redis.exists(sessionKey);
    if (!exists) {
      // Session expired or doesn't exist — generate a fresh one
      sessionId = generateSessionId();
      const now = Date.now();
      await redis.hset(redisKeys.session(sessionId), {
        state: "pending",
        createdAt: now,
        lastActiveAt: now,
      });
    }
  } else {
    // No session provided — create a standalone API key with its own session
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

  // Store key → sessionId mapping (no TTL — persistent until revoked)
  await redis.set(`${API_KEY_VALUE_PREFIX}${apiKey}`, sessionId);

  // Add to session's key index for management
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
  const body = await parseBody(request);
  if (!body || typeof body.apiKey !== "string" || !body.apiKey) {
    return jsonError(ErrorCode.VALIDATION_FAILED, "apiKey is required");
  }

  const { apiKey } = body;
  const redis = getRedis();

  // Look up which session owns this key
  const sessionId = await redis.get(`${API_KEY_VALUE_PREFIX}${apiKey}`);
  if (!sessionId || typeof sessionId !== "string") {
    return jsonError(ErrorCode.UNAUTHORIZED, "API key not found");
  }

  // Remove from index
  const indexKey = `${API_KEY_INDEX_PREFIX}${sessionId}`;
  await redis.srem(indexKey, apiKey);

  // Delete the key mapping
  await redis.del(`${API_KEY_VALUE_PREFIX}${apiKey}`);

  return jsonOk({ revoked: apiKey });
}
