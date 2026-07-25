import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { redisKeys } from "@/lib/keys";

export const runtime = "nodejs";

/**
 * GET /api/pairing/laptop-jwt?sessionId=xxx
 *
 * Returns the laptop JWT token for a given session. The laptop JWT is stored
 * in the session record when POST /api/pairing/start is called. The dashboard
 * retrieves it here so it can authenticate POST /api/pairing/approval action=respond.
 *
 * The sessionId acts as a bearer — it's a 12-byte random value (96 bits) that
 * is only known to the agent and the dashboard (displayed in the QR code).
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "missing sessionId" }, { status: 400 });
  }

  const redis = getRedis();
  const sessionKey = redisKeys.session(sessionId);

  const laptopJwt = await redis.hget<string>(sessionKey, "laptopJwt");
  if (!laptopJwt) {
    return NextResponse.json({ ok: false, error: "no laptop token found for session" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: { laptopJwt } });
}
