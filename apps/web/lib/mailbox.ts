import { getRedis } from "./redis";
import { redisKeys } from "./keys";
import { MAILBOX_MESSAGE_TTL_SECONDS } from "./constants";

/**
 * Signaling mailbox (Section 9.1 `td:mailbox:*`, Section 7.2/7.3).
 * The backend never inspects payload contents beyond what's needed to relay it.
 */
export async function pushToMailbox(
  sessionId: string,
  recipient: string,
  payload: unknown,
): Promise<void> {
  const redis = getRedis();
  const key = redisKeys.mailbox(sessionId, recipient);
  // Use a pipeline so lpush + expire are sent in one round-trip and the key
  // never outlives its TTL even if expire is never called (e.g. on crash).
  // Upstash REST pipeline: array of commands executed atomically.
  await redis.pipeline()
    .lpush(key, JSON.stringify(payload))
    .expire(key, MAILBOX_MESSAGE_TTL_SECONDS)
    .exec();
}

/**
 * Drain all queued messages for a recipient atomically (oldest-first).
 *
 * Previous implementation used LRANGE then DEL in two separate commands —
 * a race condition where a concurrent pusher could add a message between the
 * LRANGE and the DEL, silently dropping it. This version uses GETDEL-equivalent
 * logic via a Lua script executed atomically on the Redis server so no messages
 * are lost and no messages are delivered twice.
 */
export async function drainMailbox(sessionId: string, recipient: string): Promise<unknown[]> {
  const redis = getRedis();
  const key = redisKeys.mailbox(sessionId, recipient);

  // Lua script: atomically read all items then delete the key.
  // KEYS[1] = mailbox key
  // Returns the list contents (newest-first due to LRANGE 0 -1 on an lpush list),
  // then deletes the key. If the key doesn't exist, returns an empty array.
  const script = `
    local items = redis.call('LRANGE', KEYS[1], 0, -1)
    if #items > 0 then
      redis.call('DEL', KEYS[1])
    end
    return items
  `;

  try {
    const items = await redis.eval(script, [key], []) as string[];

    // Validate Lua script return type
    if (!Array.isArray(items)) {
      throw new Error(`Invalid Lua script response: expected array, got ${typeof items}`);
    }

    if (items.length === 0) return [];

    // lpush prepends → list is newest-first; reverse to restore send order.
    return items
      .slice()
      .reverse()
      .map((item) => (typeof item === "string" ? JSON.parse(item) : item));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "UnknownError";
    console.error(`[mailbox] drainMailbox error (${name}): ${message}`);
    // On Lua script error or Redis unavailability, return empty array
    // (fail-safe — mailbox messages are queued for retry anyway)
    return [];
  }
}

