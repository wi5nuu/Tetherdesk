import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
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

  const body = await parseJsonBody(request) as { pairingUrl?: string; expiresAt?: number; pairingToken?: string; laptopJwt?: string } | undefined;
  if (!body || !body.pairingUrl || !body.expiresAt) {
    return NextResponse.json({ ok: false, error: "invalid or missing pairingUrl/expiresAt" }, { status: 400 });
  }

  const redis = getRedis();
  await redis.set(ACTIVE_QR_KEY, JSON.stringify({ pairingUrl: body.pairingUrl, expiresAt: body.expiresAt, pairingToken: body.pairingToken ?? null, laptopJwt: body.laptopJwt ?? null }), { ex: ACTIVE_QR_TTL });

  return NextResponse.json({ ok: true });
}

export async function GET(_request: NextRequest) {
  const redis = getRedis();
  const raw = await redis.get<string>(ACTIVE_QR_KEY);

  if (!raw) {
    return NextResponse.json({ ok: false, error: "no active QR" }, { status: 404 });
  }

  const data = typeof raw === "string" ? JSON.parse(raw) as { pairingUrl: string; expiresAt: number } : raw as { pairingUrl: string; expiresAt: number };

  // Already expired?
  if (data.expiresAt < Date.now()) {
    await redis.del(ACTIVE_QR_KEY);
    return NextResponse.json({ ok: false, error: "QR expired" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data });
}
