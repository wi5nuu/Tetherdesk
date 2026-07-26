import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { redisKeys } from "@/lib/keys";
import { verifyAgentSecret } from "@/lib/auth";
import { parseJsonBody, getClientIp } from "@/lib/http";
import { checkPollingRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const ACTIVE_QR_KEY = "dev:active-qr";
const ACTIVE_QR_TTL = 120; // 2 minutes

/** Decode sessionId from a pairingUrl like "{origin}/pair/{base64url(json)}". */
function sessionIdFromPairingUrl(pairingUrl: string): string | undefined {
  try {
    const b64 = pairingUrl.split("/pair/")[1];
    if (!b64) return undefined;
    const s = b64.replace(/-/g, "+").replace(/_/g, "/");
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

  const sessionId = sessionIdFromPairingUrl(body.pairingUrl) ?? null;

  try {
    const redis = getRedis();
    await redis.set(ACTIVE_QR_KEY, JSON.stringify({
      pairingUrl: body.pairingUrl,
      expiresAt: body.expiresAt,
      pairingToken: body.pairingToken ?? null,
      sessionId,
    }), { ex: ACTIVE_QR_TTL });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: "active_qr_set_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return NextResponse.json({ ok: false, error: "service unavailable" }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimit = await checkPollingRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(60)),
          "X-RateLimit-Limit": String(100),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  }

  try {
    const redis = getRedis();
    const raw = await redis.get<string>(ACTIVE_QR_KEY);

    if (!raw) {
      return NextResponse.json({ ok: true, data: null });
    }

    const data = typeof raw === "string"
      ? JSON.parse(raw) as { pairingUrl: string; expiresAt: number; pairingToken?: string | null; sessionId?: string | null }
      : raw as { pairingUrl: string; expiresAt: number; pairingToken?: string | null; sessionId?: string | null };

    if (data.expiresAt < Date.now()) {
      await redis.del(ACTIVE_QR_KEY);
      return NextResponse.json({ ok: true, data: null });
    }

    let laptopJwt: string | undefined;
    if (data.sessionId) {
      try {
        laptopJwt = await redis.hget<string>(redisKeys.session(data.sessionId), "laptopJwt") ?? undefined;
      } catch {
        // Non-fatal — laptopJwt is best-effort
      }
    }

    return NextResponse.json({ ok: true, data: { ...data, laptopJwt } });
  } catch (error) {
    console.error(JSON.stringify({ event: "active_qr_get_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return NextResponse.json({ ok: false, error: "service unavailable" }, { status: 503 });
  }
}
