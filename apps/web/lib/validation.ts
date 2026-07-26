import { z } from "zod";

/** Section 15.8: every API route validates its payload via a schema before it reaches
 * business logic. Public-key fields are base64url text; we don't fully re-validate X25519
 * key structure here (that's `packages/crypto`'s job when the peer actually uses the key) —
 * just bound the size to something a legitimate key/token could ever be. */
/** 
 * X25519 public keys are 32 bytes, which is exactly 43 characters in base64url. 
 */
const pubKeyField = z
  .string()
  .length(43, "must be exactly 43 characters (32-byte base64url)")
  .regex(/^[A-Za-z0-9\-_]+$/, "must be base64url-encoded");

/**
 * Pairing tokens are 16 bytes, which is exactly 22 characters in base64url.
 */
const tokenField = z
  .string()
  .length(22, "must be exactly 22 characters (16-byte base64url)")
  .regex(/^[A-Za-z0-9\-_]+$/, "must be base64url-encoded");

export const pairingStartSchema = z.object({
  laptopPubKey: pubKeyField,
  laptopEphemeralPubKey: pubKeyField,
});
export type PairingStartInput = z.infer<typeof pairingStartSchema>;

export const pairingConfirmSchema = z.object({
  pairingToken: tokenField,
  phonePubKey: pubKeyField,
  phoneEphemeralPubKey: pubKeyField,
});
export type PairingConfirmInput = z.infer<typeof pairingConfirmSchema>;

export const signalPollQuerySchema = z.object({
  sessionId: z.string().min(1).max(128),
  recipient: z.enum(["laptop", "phone"]),
});
