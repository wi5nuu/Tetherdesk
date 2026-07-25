/** Payload encoded into the QR code / fallback pairing URL (Section 11, FR-3).
 * Contains only what's needed for rendezvous + ECDH — never a private key. */
export interface PairingQrPayload {
  backendOrigin: string;
  pairingToken: string;
  sessionId: string;
  /** Laptop's ephemeral X25519 public key for this pairing attempt, base64url-encoded. */
  laptopEphemeralPubKey: string;
}

/** Messages relayed through the Vercel signaling mailbox (Section 9.1 `td:mailbox:*`).
 * The backend forwards these opaquely — it validates size/type for abuse prevention only,
 * per Section 7.2, and must never inspect key-exchange or SDP contents beyond that. */
export type SignalingPayload =
  | { t: "key-exchange"; ephemeralPubKey: string }
  | { t: "sdp-offer"; sdp: string }
  | { t: "sdp-answer"; sdp: string }
  | { t: "ice-candidate"; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };

export function encodePairingQrPayload(payload: PairingQrPayload): string {
  return JSON.stringify(payload);
}

export function decodePairingQrPayload(raw: string): PairingQrPayload {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new TypeError("malformed pairing QR payload");
  }
  const candidate = parsed as Record<string, unknown>;
  const requiredStringFields = [
    "backendOrigin",
    "pairingToken",
    "sessionId",
    "laptopEphemeralPubKey",
  ] as const;
  for (const field of requiredStringFields) {
    if (typeof candidate[field] !== "string") {
      throw new TypeError(`malformed pairing QR payload: missing or non-string '${field}'`);
    }
  }
  return {
    backendOrigin: candidate["backendOrigin"] as string,
    pairingToken: candidate["pairingToken"] as string,
    sessionId: candidate["sessionId"] as string,
    laptopEphemeralPubKey: candidate["laptopEphemeralPubKey"] as string,
  };
}
