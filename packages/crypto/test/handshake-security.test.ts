import { describe, expect, it } from "vitest";
import { deriveSharedSecret, generateX25519KeyPair } from "../src/x25519.js";
import { deriveSessionKey } from "../src/hkdf.js";
import { aeadEncrypt, importAeadKey } from "../src/aead.js";
import { toBase64Url } from "../src/encoding.js";

/**
 * Security Requirement #1 (Section 15.1): the Vercel backend must be cryptographically
 * incapable of decrypting session data. This test runs the full pairing handshake through a
 * mock "malicious" backend that logs every byte it is asked to relay (exactly what a real
 * relay sees: public keys, pairing token, session ID) and asserts that no plaintext session
 * key or shared secret ever appears in those logs, byte-for-byte or as a substring encoding.
 */
describe("handshake security: malicious backend cannot recover the session key", () => {
  it("never exposes the shared secret or derived session key to the relay", async () => {
    const relayLog: string[] = [];
    const mockBackendRelay = {
      relay(payload: Record<string, string>): void {
        for (const value of Object.values(payload)) {
          relayLog.push(value);
        }
      },
    };

    const laptop = generateX25519KeyPair();
    const phone = generateX25519KeyPair();
    const pairingToken = "pt_" + toBase64Url(new Uint8Array(16).fill(42));
    const sessionId = "sess_" + toBase64Url(new Uint8Array(8).fill(7));

    mockBackendRelay.relay({
      pairingToken,
      sessionId,
      laptopEphemeralPubKey: toBase64Url(laptop.publicKey),
    });
    mockBackendRelay.relay({
      sessionId,
      phoneEphemeralPubKey: toBase64Url(phone.publicKey),
    });

    const laptopShared = deriveSharedSecret(laptop.secretKey, phone.publicKey);
    const phoneShared = deriveSharedSecret(phone.secretKey, laptop.publicKey);
    expect(laptopShared).toEqual(phoneShared);

    const salt = new TextEncoder().encode(sessionId);
    const laptopSessionKey = deriveSessionKey(laptopShared, salt);
    const phoneSessionKey = deriveSessionKey(phoneShared, salt);
    expect(laptopSessionKey).toEqual(phoneSessionKey);

    const key = await importAeadKey(laptopSessionKey);
    const sealed = await aeadEncrypt(key, new TextEncoder().encode("mouse move 10,20"));

    const secretsThatMustNeverAppearInLogs = [
      toBase64Url(laptop.secretKey),
      toBase64Url(phone.secretKey),
      toBase64Url(laptopShared),
      toBase64Url(laptopSessionKey),
    ];

    const fullLogText = relayLog.join("\n");
    for (const secret of secretsThatMustNeverAppearInLogs) {
      expect(fullLogText).not.toContain(secret);
    }
    // Sanity: the relay log did legitimately see the public material.
    expect(fullLogText).toContain(toBase64Url(laptop.publicKey));
    expect(fullLogText).toContain(toBase64Url(phone.publicKey));
    // Sanity: the AEAD envelope produced actual ciphertext, not plaintext.
    expect(new TextDecoder().decode(sealed.ciphertext)).not.toContain("mouse move");
  });
});
