import { describe, expect, it } from "vitest";
import { aeadDecrypt, aeadEncrypt, importAeadKey } from "../src/aead.js";
import { deriveSessionKey } from "../src/hkdf.js";

async function testKey(seed: number): Promise<CryptoKey> {
  const raw = deriveSessionKey(new Uint8Array(32).fill(seed), new Uint8Array(16).fill(seed));
  return importAeadKey(raw);
}

describe("AES-256-GCM AEAD envelope", () => {
  it("round-trips plaintext", async () => {
    const key = await testKey(1);
    const plaintext = new TextEncoder().encode("move mouse to 100,200");
    const sealed = await aeadEncrypt(key, plaintext);
    const decrypted = await aeadDecrypt(key, sealed);
    expect(new TextDecoder().decode(decrypted)).toBe("move mouse to 100,200");
  });

  it("produces a fresh random IV on every call", async () => {
    const key = await testKey(2);
    const plaintext = new TextEncoder().encode("hello");
    const a = await aeadEncrypt(key, plaintext);
    const b = await aeadEncrypt(key, plaintext);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it("authenticates additional data — tampered AAD fails decryption", async () => {
    const key = await testKey(3);
    const plaintext = new TextEncoder().encode("secret");
    const aad = new TextEncoder().encode("session-1");
    const sealed = await aeadEncrypt(key, plaintext, aad);
    await expect(
      aeadDecrypt(key, sealed, new TextEncoder().encode("session-2")),
    ).rejects.toThrow();
  });

  it("fails decryption when the ciphertext is tampered with", async () => {
    const key = await testKey(4);
    const plaintext = new TextEncoder().encode("do not modify me");
    const sealed = await aeadEncrypt(key, plaintext);
    const tampered = new Uint8Array(sealed.ciphertext);
    tampered[0] = tampered[0]! ^ 0xff;
    await expect(aeadDecrypt(key, { ciphertext: tampered, iv: sealed.iv })).rejects.toThrow();
  });

  it("fails decryption under the wrong key", async () => {
    const keyA = await testKey(5);
    const keyB = await testKey(6);
    const sealed = await aeadEncrypt(keyA, new TextEncoder().encode("payload"));
    await expect(aeadDecrypt(keyB, sealed)).rejects.toThrow();
  });
});
