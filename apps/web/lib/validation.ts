import { z } from "zod";

/** Section 15.8: every API route validates its payload via a schema before it reaches
 * business logic. Public-key fields are base64url text; we don't fully re-validate X25519
 * key structure here (that's `packages/crypto`'s job when the peer actually uses the key) —
 * just bound the size to something a legitimate key/token could ever be. */
const base64UrlField = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9\-_]+$/, "must be base64url-encoded");

export const pairingStartSchema = z.object({
  laptopPubKey: base64UrlField,
  laptopEphemeralPubKey: base64UrlField,
});
export type PairingStartInput = z.infer<typeof pairingStartSchema>;

export const pairingConfirmSchema = z.object({
  pairingToken: base64UrlField,
  phonePubKey: base64UrlField,
  phoneEphemeralPubKey: base64UrlField,
});
export type PairingConfirmInput = z.infer<typeof pairingConfirmSchema>;

export const signalPollQuerySchema = z.object({
  sessionId: z.string().min(1).max(128),
  recipient: z.enum(["laptop", "phone"]),
});
