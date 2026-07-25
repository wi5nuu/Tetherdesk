import { getRedis } from "./redis";
import { redisKeys } from "./keys";
import {
  PAIRING_TOKEN_TTL_SECONDS,
  PAIRING_TOKEN_USED_TOMBSTONE_TTL_SECONDS,
  SESSION_TTL_SECONDS,
} from "./constants";

export interface PairingRecord {
  laptopPubKey: string;
  laptopEphemeralPubKey: string;
  sessionId: string;
  createdAt: string;
}

export async function createPairingRecord(
  pairingToken: string,
  record: PairingRecord,
): Promise<void> {
  const redis = getRedis();
  const key = redisKeys.pairing(pairingToken);
  // BUG-R: pipeline hset+expire into one round-trip so the TTL is always set
  // atomically with the write. Two separate calls risk a crash between them
  // leaving a key with no TTL that persists forever.
  await redis.pipeline()
    .hset(key, { ...record })
    .expire(key, PAIRING_TOKEN_TTL_SECONDS)
    .exec();
}

export async function createSessionRecord(
  sessionId: string,
  fields: Record<string, string | number>,
): Promise<void> {
  const redis = getRedis();
  const key = redisKeys.session(sessionId);
  // Pipeline hset+expire into one round-trip for the same reason as createPairingRecord:
  // a crash between two separate calls would leave a key with no TTL that never expires.
  await redis.pipeline()
    .hset(key, { ...fields })
    .expire(key, SESSION_TTL_SECONDS)
    .exec();
}

/**
 * BUG-PA1: Write both the pairing record and the session record in a single
 * Redis pipeline so they land atomically. Previously these were two separate
 * pipelines — a crash between them would leave a pairing token that points to
 * a non-existent session, making that pairing attempt permanently unresolvable.
 *
 * Note: Upstash REST pipelines send all commands in one HTTP round-trip but do
 * NOT give MULTI/EXEC transaction semantics (they do not roll back on error).
 * This is acceptable here because:
 *  1. Both writes are idempotent — a partial apply followed by a retry is safe.
 *  2. The pairing token has a 90s TTL, so an orphaned token self-cleans quickly.
 *  3. True atomicity across two different key types would require a Lua script
 *     that is significantly more complex for marginal practical benefit in this
 *     single-user, low-write-rate system.
 */
export async function createPairingAndSessionRecords(
  pairingToken: string,
  pairingRecord: PairingRecord,
  sessionId: string,
  sessionFields: Record<string, string | number>,
): Promise<void> {
  const redis = getRedis();
  const pairingKey = redisKeys.pairing(pairingToken);
  const sessionKey = redisKeys.session(sessionId);
  await redis.pipeline()
    .hset(pairingKey, { ...pairingRecord })
    .expire(pairingKey, PAIRING_TOKEN_TTL_SECONDS)
    .hset(sessionKey, { ...sessionFields })
    .expire(sessionKey, SESSION_TTL_SECONDS)
    .exec();
}

export async function updateSessionRecord(
  sessionId: string,
  fields: Record<string, string | number>,
): Promise<void> {
  const redis = getRedis();
  const key = redisKeys.session(sessionId);
  // Use a pipeline so hset + expire are sent in one round-trip.
  // This implements the "24h sliding TTL" from Section 9.1 — every activity
  // on the session resets the expiry so an active session never expires mid-use.
  await redis.pipeline()
    .hset(key, { ...fields })
    .expire(key, SESSION_TTL_SECONDS)
    .exec();
}

export type ConsumePairingTokenResult =
  | { status: "ok"; record: PairingRecord }
  | { status: "used" }
  | { status: "missing" };

/**
 * Atomically consume a single-use pairing token (Section 15.2). A Lua script performs the
 * HGETALL + DEL as one atomic step to close the race window where two concurrent confirmers
 * could otherwise both read the record before either deletes it. A short-lived tombstone key
 * is set on successful consumption so a *second* confirm attempt can be told
 * PAIRING_TOKEN_ALREADY_USED instead of the less specific PAIRING_TOKEN_EXPIRED (Section 19).
 */
const CONSUME_PAIRING_TOKEN_LUA = `
local pairKey = KEYS[1]
local usedKey = KEYS[2]
local usedTtl = tonumber(ARGV[1])

local data = redis.call('HGETALL', pairKey)
if next(data) == nil then
  if redis.call('EXISTS', usedKey) == 1 then
    return {'used'}
  end
  return {'missing'}
end

redis.call('DEL', pairKey)
redis.call('SET', usedKey, '1', 'EX', usedTtl)
table.insert(data, 1, 'ok')
return data
`;

export async function consumePairingToken(pairingToken: string): Promise<ConsumePairingTokenResult> {
  const redis = getRedis();
  try {
    const raw = await redis.eval(
      CONSUME_PAIRING_TOKEN_LUA,
      [redisKeys.pairing(pairingToken), redisKeys.pairingUsed(pairingToken)],
      [String(PAIRING_TOKEN_USED_TOMBSTONE_TTL_SECONDS)],
    );
    
    // Validate Lua script return type
    if (!Array.isArray(raw)) {
      throw new Error(`Invalid Lua script response: expected array, got ${typeof raw}`);
    }
    
    const result = raw as string[];
    const [status, ...rest] = result;
    if (status === "used") {
      return { status: "used" };
    }
    if (status === "missing" || status === undefined) {
      return { status: "missing" };
    }
    const record: Record<string, string> = {};
    for (let i = 0; i + 1 < rest.length; i += 2) {
      record[rest[i]!] = rest[i + 1]!;
    }

    // BUG-PA2-EMPTY-FIELDS: validate that the critical fields are present and
    // non-empty before returning. The Lua HGETALL result could theoretically
    // contain empty-string values if a record was written with missing fields,
    // which would let a corrupt token slip through as "ok" and produce a
    // pairing record with blank keys — causing a downstream 400/500 rather than
    // a clear PAIRING_TOKEN_EXPIRED error.
    const laptopPubKey = record["laptopPubKey"] ?? "";
    const laptopEphemeralPubKey = record["laptopEphemeralPubKey"] ?? "";
    const sessionId = record["sessionId"] ?? "";
    const createdAt = record["createdAt"] ?? "";

    if (!laptopPubKey || !laptopEphemeralPubKey || !sessionId) {
      // Treat a structurally invalid record the same as a missing token.
      return { status: "missing" };
    }

    return {
      status: "ok",
      record: { laptopPubKey, laptopEphemeralPubKey, sessionId, createdAt },
    };
  } catch (err) {
    // Log Lua script errors for debugging
    if (err instanceof Error && err.message.includes("ERR Error")) {
      console.error(`[pairingStore] Lua script error: ${err.message}`);
    }
    // On Lua script error or Redis unavailability, treat as missing token
    // (fail-closed — don't allow pairing to proceed with corrupt state)
    return { status: "missing" };
  }
}
