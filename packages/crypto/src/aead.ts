import type { webcrypto } from "node:crypto";

// Type-only aliases so this module stays isomorphic: browsers get these names from `lib.dom`,
// Node gets them from `node:crypto`'s `webcrypto` namespace — either way this import is erased
// at build time and never affects the runtime, which always goes through globalThis.crypto.
type CryptoKey = webcrypto.CryptoKey;
type SubtleCrypto = webcrypto.SubtleCrypto;

const AES_GCM_IV_LENGTH_BYTES = 12;

export interface AeadSealed {
  ciphertext: Uint8Array;
  iv: Uint8Array;
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "WebCrypto SubtleCrypto is unavailable in this runtime — Node 20+ or a modern browser is required",
    );
  }
  return subtle;
}

/** Import raw key bytes (as produced by deriveSessionKey) as a non-extractable AES-256-GCM key. */
export async function importAeadKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return getSubtle().importKey("raw", new Uint8Array(rawKey), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt with AES-256-GCM. This is the application-layer envelope described in Section
 * 10.2 step 7 — defense in depth on top of WebRTC's own DTLS-SRTP transport encryption, so a
 * TURN relay (which can see encrypted transport traffic) still cannot read plaintext. */
export async function aeadEncrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  additionalData?: Uint8Array,
): Promise<AeadSealed> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH_BYTES));
  const ciphertext = new Uint8Array(
    await getSubtle().encrypt(
      { name: "AES-GCM", iv, additionalData: additionalData ? new Uint8Array(additionalData) : undefined },
      key,
      new Uint8Array(plaintext),
    ),
  );
  return { ciphertext, iv };
}

export async function aeadDecrypt(
  key: CryptoKey,
  sealed: AeadSealed,
  additionalData?: Uint8Array,
): Promise<Uint8Array> {
  const plaintext = await getSubtle().decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(sealed.iv),
      additionalData: additionalData ? new Uint8Array(additionalData) : undefined,
    },
    key,
    new Uint8Array(sealed.ciphertext),
  );
  return new Uint8Array(plaintext);
}
