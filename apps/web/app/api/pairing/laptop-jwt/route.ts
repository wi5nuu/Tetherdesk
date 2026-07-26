import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { redisKeys } from "@/lib/keys";

export const runtime = "nodejs";

/**
 * GET /api/pairing/laptop-jwt?sessionId=xxx&pairingToken=yyy
 *
 * Returns the laptop JWT token for a given session. The laptop JWT is stored
 * in the session record when POST /api/pairing/start is called. The dashboard
 * retrieves it here so it can authenticate POST /api/pairing/approval action=respond.
 *
 * Requires BOTH sessionId and pairingToken — the pairing token proves the caller
 * has access to the active QR payload, preventing session hijacking via QR scan.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const pairingToken = request.nextUrl.searchParams.get("pairingToken");

  if (!sessionId || !pairingToken) {
    return NextResponse.json({ ok: false, error: "missing sessionId or pairingToken" }, { status: 400 });
  }

  try {
    const redis = getRedis();
    const sessionKey = redisKeys.session(sessionId);
    const pairKey = redisKeys.pairing(pairingToken);

    const pairRecord = await redis.hgetall<Record<string, string>>(pairKey);
    if (!pairRecord || pairRecord.sessionId !== sessionId) {
      return NextResponse.json({ ok: false, error: "invalid pairing token for session" }, { status: 401 });
    }

    const laptopJwt = await redis.hget<string>(sessionKey, "laptopJwt");
    if (!laptopJwt) {
      return NextResponse.json({ ok: false, error: "no laptop token found for session" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: { laptopJwt } });
  } catch (error) {
    console.error(JSON.stringify({ event: "laptop_jwt_failed", sessionId, pairingToken, errorType: error instanceof Error ? error.name : "unknown" }));
    return NextResponse.json({ ok: false, error: "service unavailable" }, { status: 503 });
  }
}
