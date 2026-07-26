import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { redisKeys } from "@/lib/keys";
import { verifyAgentSecret } from "@/lib/auth";
import { parseJsonBody } from "@/lib/http";

export const runtime = "nodejs";

const ACTIVE_QR_KEY = "dev:active-qr";
const ACTIVE_QR_TTL = 120; // 2 minutes

/** Decode sessionId from a pairingUrl like "{origin}/pair/{base64url(json)}". */
function sessionIdFromPairingUrl(pairingUrl: string): string | undefined {
  try {
    const b64 = pairingUrl.split("/pair/")[1];
    if (!b64) return undefined;
    const s = b64.replace(/-/g, "+").replace(/_/g, "");
    const padding = 4 - (s.length % 4);
    const json = JSON.parse(Buffer.from(s + "=".repeat(padding === 4 ? 0 : padding), "base64").toString("utf8"));
    return json?.sessionId;
  } catch {
    return undefined;
  }
}

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

  // Extract sessionId from pairingUrl so we can resolve laptopJwt later without the
  // pairing record (which gets GETDEL'd when the phone confirms — Section 10.6).
  const sessionId = sessionIdFromPairingUrl(body.pairingUrl) ?? null;

  const redis = getRedis();
  await redis.set(ACTIVE_QR_KEY, JSON.stringify({
    pairingUrl: body.pairingUrl,
    expiresAt: body.expiresAt,
    pairingToken: body.pairingToken ?? null,
    sessionId,
  }), { ex: ACTIVE_QR_TTL });

  return NextResponse.json({ ok: true });
}

export async function GET(_request: NextRequest) {
  const redis = getRedis();
  const raw = await redis.get<string>(ACTIVE_QR_KEY);

  if (!raw) {
    return NextResponse.json({ ok: false, error: "no active QR" }, { status: 404 });
  }

  const data = typeof raw === "string"
    ? JSON.parse(raw) as { pairingUrl: string; expiresAt: number; pairingToken?: string | null; sessionId?: string | null }
    : raw as { pairingUrl: string; expiresAt: number; pairingToken?: string | null; sessionId?: string | null };

  // Already expired?
  if (data.expiresAt < Date.now()) {
    await redis.del(ACTIVE_QR_KEY);
    return NextResponse.json({ ok: false, error: "QR expired" }, { status: 404 });
  }

  // Resolve laptopJwt from the session record using the stored sessionId.
  // We cannot use pairingToken here because it was already GETDEL'd when the
  // phone confirmed the pairing (consumePairingToken in pairing.ts).
  let laptopJwt: string | undefined;
  if (data.sessionId) {
    try {
      laptopJwt = await redis.hget<string>(redisKeys.session(data.sessionId), "laptopJwt") ?? undefined;
    } catch {
      // Non-fatal — laptopJwt is best-effort
    }
  }

  return NextResponse.json({ ok: true, data: { ...data, laptopJwt } });
}
