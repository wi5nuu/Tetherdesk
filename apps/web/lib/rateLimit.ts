import { getRedis } from "./redis";
import { redisKeys } from "./keys";
import { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_SECONDS } from "./constants";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

// BUG-L: The previous incr + expire pattern had a race condition — if Redis
// crashed or timed out between the two calls, the key would never expire and
// the user would be permanently rate-limited. Fix: use a Lua script so the
// INCR and EXPIRE (only on first increment) are executed atomically in one
// round-trip. If the key already exists we skip the EXPIRE so we don't reset
// the sliding window on every request.
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIRE', key, window)
end
return count
`;

export async function checkRateLimit(
  key: string,
  failOpen: boolean,
  maxAttempts = RATE_LIMIT_MAX_ATTEMPTS,
  windowSeconds = RATE_LIMIT_WINDOW_SECONDS
): Promise<RateLimitResult> {
  const redis = getRedis();
  try {
    const count = (await redis.eval(
      RATE_LIMIT_LUA,
      [key],
      [String(windowSeconds)],
    )) as number;
    
    // Validate Lua script return value
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
      throw new Error(`Invalid Lua script response: expected positive number, got ${typeof count}`);
    }
    
    return {
      allowed: count <= maxAttempts,
      remaining: Math.max(0, maxAttempts - count),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "UnknownError";
    console.error(`[rateLimit] checkRateLimit error (${name}): ${message}`);
    
    if (failOpen) {
      // BUG-RL1: /start is a low-value target (no secrets returned) — failing
      // closed here would make the agent unable to start a new pairing session
      // whenever Redis is momentarily unavailable, which is worse than the
      // marginal increase in brute-force surface. Fail open so pairing can
      // proceed; the single-use token and 90s TTL are the primary guards.
      return { allowed: true, remaining: maxAttempts };
    }
    // Fail closed for /confirm — it's the highest-value endpoint (completes
    // pairing), so denying on Redis unavailability is the safer default.
    return { allowed: false, remaining: 0 };
  }
}

/**
 * Rate limiter for `/api/pairing/start` (Section 15.3): 5 attempts per 15 minutes per IP.
 * Uses a separate Redis key from /confirm so hitting the start limit doesn't block confirm.
 * Fails OPEN on Redis unavailability — /start returns no secrets (only a pairing token
 * that is single-use and short-lived), so availability matters more than hard-blocking here.
 */
export async function checkPairingStartRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(redisKeys.rateLimitPairStart(ip), true);
}

/**
 * Rate limiter for `/api/pairing/confirm` (Section 15.3): 5 attempts per 15 minutes per IP.
 * Fails CLOSED on Redis unavailability — pairing/confirm is the highest-value target.
 */
export async function checkPairingConfirmRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(redisKeys.rateLimitPairConfirm(ip), false);
}
/**
 * Rate limiter for polling endpoints like `/api/pairing/active-qr` or `/api/signal/poll`.
 * Allows 100 requests per 60 seconds per IP.
 * Fails OPEN on Redis unavailability to avoid breaking polling loops.
 */
export async function checkPollingRateLimit(ip: string, endpoint: string): Promise<RateLimitResult> {
  // Use a separate namespace for polling to avoid clashing with start/confirm
  // Scope by endpoint so polling active-qr doesn't exhaust signal/poll limits
  return checkRateLimit(redisKeys.rateLimitPoll(endpoint, ip), true, 100, 60);
}
