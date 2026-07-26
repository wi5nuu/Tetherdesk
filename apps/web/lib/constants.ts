/** Redis TTLs and rate-limit thresholds (Section 9.1, 15.2, 15.3). Kept as named constants,
 * not scattered literals, so the security checklist can point at one definition each. */
export const PAIRING_TOKEN_TTL_SECONDS = 90;
export const PAIRING_TOKEN_USED_TOMBSTONE_TTL_SECONDS = 300;
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
export const MAILBOX_MESSAGE_TTL_SECONDS = 5 * 60;
export const PRESENCE_TTL_SECONDS = 30;
export const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
export const RATE_LIMIT_MAX_ATTEMPTS = process.env.NODE_ENV === "development" ? 100 : 30;
export const REVOCATION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_BEARER_TOKEN_TTL_SECONDS = 24 * 60 * 60;
export const APP_VERSION = "2.1.28";
