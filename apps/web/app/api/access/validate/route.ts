import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ErrorCode, type PairingQrPayload } from "@tetherdesk/protocol";
import { getRedis } from "@/lib/redis";
import { redisKeys } from "@/lib/keys";

export const runtime = "nodejs";
export const maxDuration = 10;

const API_KEY_PREFIX = "td:apikey:";

interface ValidateBody {
  key: string;
  remember?: boolean;
}

function jsonOk(data: { redirect: string; sessionId: string; type: string }) {
  return NextResponse.json({ ok: true, redirect: data.redirect, sessionId: data.sessionId, type: data.type });
}

function jsonError(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ValidateBody;
  try {
    body = (await request.json()) as ValidateBody;
  } catch {
    return jsonError(ErrorCode.VALIDATION_FAILED, "invalid JSON body");
  }

  const key = body.key?.trim();
  if (!key) {
    return jsonError(ErrorCode.VALIDATION_FAILED, "access key is required");
  }

  if (key.length < 6) {
    return jsonError(ErrorCode.VALIDATION_FAILED, "access key is too short");
  }

  const redis = getRedis();
  const backendOrigin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  // Persistent API key: sk-<32 hex chars> (35 chars total)
  if (key.startsWith("sk-")) {
    if (!/^sk-[0-9a-f]{32}$/i.test(key)) {
      return jsonError(ErrorCode.VALIDATION_FAILED, "Invalid API key format");
    }
    const stored = await redis.get(`${API_KEY_PREFIX}${key}`);
    if (!stored || typeof stored !== "string") {
      return jsonError(ErrorCode.UNAUTHORIZED, "Invalid API key");
    }
    return jsonOk({ type: "persistent", redirect: "/control", sessionId: stored });
  }

  // One-time key: the pairing token (with or without TD- prefix)
  const token = key.startsWith("TD-") ? key.slice(3) : key;

  // Read the pairing hash stored by POST /api/pairing/start
  const pairKey = redisKeys.pairing(token);
  const record = await redis.hgetall<Record<string, string>>(pairKey);
  if (!record || !record.sessionId || !record.laptopEphemeralPubKey) {
    return jsonError(
      ErrorCode.UNAUTHORIZED,
      "Invalid or expired access key. Run `tetherdesk start` on your computer to generate a new one.",
    );
  }

  // Build the PairingQrPayload and encode as a URL the phone can open
  const payload: PairingQrPayload = {
    backendOrigin,
    pairingToken: token,
    sessionId: record.sessionId,
    laptopEphemeralPubKey: record.laptopEphemeralPubKey,
  };

  const b64url = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

  return jsonOk({
    type: "one-time",
    redirect: `/pair/${b64url}`,
    sessionId: record.sessionId,
  });
}
