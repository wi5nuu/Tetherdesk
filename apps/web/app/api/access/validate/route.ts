import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ErrorCode, type PairingQrPayload } from "@tetherdesk/protocol";
import { getRedis } from "@/lib/redis";
import { redisKeys } from "@/lib/keys";
import { checkRateLimit } from "@/lib/rateLimit";

import { getClientIp } from "@/lib/http";

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
  const ip = getClientIp(request);
  const rl = await checkRateLimit(redisKeys.rateLimitAccessValidate(ip), true);
  if (!rl.allowed) {
    return jsonError(ErrorCode.RATE_LIMITED, "Too many attempts — try again later", 429);
  }

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

  try {
    if (key.startsWith("sk-")) {
      if (!/^sk-[0-9a-f]{32}$/i.test(key)) {
        return jsonError(ErrorCode.VALIDATION_FAILED, "Invalid API key format");
      }
      const stored = await redis.get(`${API_KEY_PREFIX}${key}`);
      if (!stored || typeof stored !== "string") {
        return jsonError(ErrorCode.UNAUTHORIZED, "Invalid API key");
      }
      return jsonOk({
        type: "api-key",
        redirect: `/dashboard?apiKey=${encodeURIComponent(key)}`,
        sessionId: stored,
      });
    }

    const token = key.startsWith("TD-") ? key.slice(3) : key;
    const pairKey = redisKeys.pairing(token);
    const record = await redis.hgetall<Record<string, string>>(pairKey);
    if (!record || !record.sessionId || !record.laptopEphemeralPubKey) {
      return jsonError(
        ErrorCode.UNAUTHORIZED,
        "Invalid or expired access key. Run `tetherdesk start` on your computer to generate a new one.",
      );
    }

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
  } catch (error) {
    console.error(JSON.stringify({ event: "access_validate_failed", keyType: key.startsWith("sk-") ? "api-key" : "one-time", errorType: error instanceof Error ? error.name : "unknown" }));
    return jsonError(ErrorCode.STORE_UNAVAILABLE, "service unavailable — please try again later", 503);
  }
}
