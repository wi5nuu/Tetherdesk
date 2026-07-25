import { toBase64Url } from "@tetherdesk/crypto";

/** 128-bit random pairing token (Section 10.2 step 1). */
export function generatePairingToken(): string {
  return toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

export function generateSessionId(): string {
  return toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(12)));
}
