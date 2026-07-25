import { x25519 } from "@noble/curves/ed25519.js";

/** X25519 keypair. Never transmit `secretKey` — only `publicKey` ever leaves the device
 * that generated it (Section 10.1, 10.2). */
export interface X25519KeyPair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export function generateX25519KeyPair(): X25519KeyPair {
  const { secretKey, publicKey } = x25519.keygen();
  return { secretKey, publicKey };
}

/** ECDH: derive the raw shared secret from this device's secret key and the peer's public
 * key. Callers must pass this through HKDF (see hkdf.ts) before using it as a symmetric key —
 * a raw ECDH output is not directly safe to use as an AEAD key. */
export function deriveSharedSecret(secretKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(secretKey, peerPublicKey);
}
