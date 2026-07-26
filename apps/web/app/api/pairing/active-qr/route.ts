import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { redisKeys } from "@/lib/keys";
import { verifyAgentSecret } from "@/lib/auth";
import { parseJsonBody } from "@/lib/http";

export const runtime = "nodejs";

const ACTIVE_QR_KEY = "dev:active-qr";
const ACTIVE_QR_TTL = 120; // 2 minutes

// POST — agent registers its pairing URL (requires AGENT_SECRET)
// GET  — web page polls for the current QR (public — dashboard needs it unauthenticated)
export async function POST(request: NextRequest) {
  if (!verifyAgentSecret(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await parseJsonBody(request) as { pairingUrl?: string; expiresAt?: number; pairingToken?: string } | undefined;
  if (!body || !body.pairingUrl || !body.expiresAt) {
    return NextResponse.json({ ok: false, error: "invalid or missing pairingUrl/expiresAt" }, { status: 400 });
  }

  const redis = getRedis();
  await redis.set(ACTIVE_QR_KEY, JSON.stringify({ pairingUrl: body.pairingUrl, expiresAt: body.expiresAt, pairingToken: body.pairingToken ?? null }), { ex: ACTIVE_QR_TTL });

  return NextResponse.json({ ok: true });
}

export async function GET(_request: NextRequest) {
  const redis = getRedis();
  const raw = await redis.get<string>(ACTIVE_QR_KEY);

  if (!raw) {
    return NextResponse.json({ ok: false, error: "no active QR" }, { status: 404 });
  }

  const data = typeof raw === "string" ? JSON.parse(raw) as { pairingUrl: string; expiresAt: number; pairingToken?: string } : raw as { pairingUrl: string; expiresAt: number; pairingToken?: string };

  // Already expired?
  if (data.expiresAt < Date.now()) {
    await redis.del(ACTIVE_QR_KEY);
    return NextResponse.json({ ok: false, error: "QR expired" }, { status: 404 });
  }

  // Dynamically resolve laptopJwt from session record via pairingToken
  // (Section 10.6) — this works regardless of agent version because the
  // backend stores laptopJwt during POST /api/pairing/start.
  let laptopJwt: string | undefined;
  if (data.pairingToken) {
    try {
      const pairRecord = await redis.hgetall<Record<string, string>>(redisKeys.pairing(data.pairingToken));
      const sessionId = pairRecord?.sessionId;
      if (sessionId) {
        laptopJwt = await redis.hget<string>(redisKeys.session(sessionId), "laptopJwt") ?? undefined;
      }
    } catch {
      // Non-fatal — laptopJwt is a best-effort optimization
    }
  }

  return NextResponse.json({ ok: true, data: { ...data, laptopJwt } });
}
