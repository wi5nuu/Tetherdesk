import { describe, expect, it } from "vitest";
import { deriveSharedSecret, generateX25519KeyPair } from "../src/x25519.js";

describe("X25519 ECDH", () => {
  it("generates 32-byte keypairs", () => {
    const pair = generateX25519KeyPair();
    expect(pair.secretKey.length).toBe(32);
    expect(pair.publicKey.length).toBe(32);
  });

  it("generates distinct keypairs on each call", () => {
    const a = generateX25519KeyPair();
    const b = generateX25519KeyPair();
    expect(a.secretKey).not.toEqual(b.secretKey);
    expect(a.publicKey).not.toEqual(b.publicKey);
  });

  it("derives matching shared secrets for both sides of a handshake", () => {
    const alice = generateX25519KeyPair();
    const bob = generateX25519KeyPair();

    const aliceShared = deriveSharedSecret(alice.secretKey, bob.publicKey);
    const bobShared = deriveSharedSecret(bob.secretKey, alice.publicKey);

    expect(aliceShared).toEqual(bobShared);
    expect(aliceShared.length).toBe(32);
  });

  it("produces different shared secrets for different peer pairs", () => {
    const alice = generateX25519KeyPair();
    const bob = generateX25519KeyPair();
    const mallory = generateX25519KeyPair();

    const aliceBob = deriveSharedSecret(alice.secretKey, bob.publicKey);
    const aliceMallory = deriveSharedSecret(alice.secretKey, mallory.publicKey);

    expect(aliceBob).not.toEqual(aliceMallory);
  });
});
