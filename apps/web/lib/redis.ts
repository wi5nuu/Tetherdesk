import { Redis } from "@upstash/redis";

let cachedClient: Redis | undefined;

/** Lazily-constructed singleton REST Redis client (Section 7.4 — every request must be
 * written as if it could hit a cold, stateless Function instance; the client itself is
 * just an HTTP wrapper, so there's no connection state to worry about recycling). */
export function getRedis(): Redis {
  if (cachedClient) {
    return cachedClient;
  }
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not configured in the environment",
    );
  }
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

/** Test-only hook so integration tests can point the singleton at a fresh local Redis
 * instance per test file without leaking state across the suite. */
export function resetRedisClientForTesting(): void {
  cachedClient = undefined;
}
