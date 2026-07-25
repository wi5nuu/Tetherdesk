import { NextResponse } from "next/server";
import { apiOk } from "@tetherdesk/protocol";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(): Promise<NextResponse> {
  // Check Redis connectivity — a healthy deployment requires the store to be reachable.
  // The installer polls this endpoint after deploy; returning ok:true with a broken
  // Redis would cause silent failures in every subsequent step.
  let redisOk = false;
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    redisOk = pong === "PONG";
  } catch {
    redisOk = false;
  }

  if (!redisOk) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "STORE_UNAVAILABLE",
          message: "Redis is not reachable — check UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN",
          retryable: true,
        },
      },
      { status: 503 },
    );
  }

  return NextResponse.json(apiOk({ status: "healthy", time: new Date().toISOString() }));
}

