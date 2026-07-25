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

/* ------------------------------------------------------------------ */
/*  Pairing QR code / URL helpers                                      */
/* ------------------------------------------------------------------ */

/** Encode the payload as a URL the phone can open directly.
 *  `{backendOrigin}/pair/{base64url(JSON)}` */
export function encodePairingQrPayload(payload: PairingQrPayload): string {
  const json = JSON.stringify(payload);
  const b64url = Buffer.from(json, "utf8").toString("base64url");
  return `${payload.backendOrigin}/pair/${b64url}`;
}

/** Decode a URL, raw JSON, or bare base64url token back into a payload. */
export function decodePairingQrPayload(raw: string): PairingQrPayload {
  const json = extractJson(raw);
  return parseAndValidate(json);
}

/** Try to extract the JSON string from a URL, base64url token, or raw JSON. */
function extractJson(raw: string): string {
  const trimmed = raw.trim();

  // URL format: https://host/pair/{base64url}
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const match = trimmed.match(/\/pair\/([^/?#]+)/);
    if (!match || match[1] === undefined) throw new TypeError("malformed pairing URL: expected /pair/<token> path");
    return base64urlDecode(decodeURIComponent(match[1]));
  }

  // Raw JSON (backward compat with older QR codes)
  if (trimmed.startsWith("{")) return trimmed;

  // Assume it's a bare base64url token
  return base64urlDecode(trimmed);
}

function base64urlDecode(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
}

/** Parse a JSON string and validate the required fields. */
function parseAndValidate(json: string): PairingQrPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new TypeError("malformed pairing QR payload: invalid JSON");
  }
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
