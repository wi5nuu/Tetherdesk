import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

export const SESSION_KEY_LENGTH_BYTES = 32;

/** Derive a symmetric session key from a raw ECDH shared secret via HKDF-SHA256 (RFC 5869).
 * `salt` should be a non-secret per-pairing value (e.g. the pairing token or session ID) and
 * `info` a fixed application-context string, so keys are bound to the pairing they came from. */
export function deriveSessionKey(
  sharedSecret: Uint8Array,
  salt: Uint8Array,
  info = "tetherdesk/session-key/v1",
  length = SESSION_KEY_LENGTH_BYTES,
): Uint8Array {
  return hkdf(sha256, sharedSecret, salt, utf8ToBytes(info), length);
}
