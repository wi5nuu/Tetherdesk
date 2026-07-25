import { describe, expect, it } from "vitest";
import { deriveSharedSecret, generateX25519KeyPair } from "../src/x25519.js";
import { deriveSessionKey, SESSION_KEY_LENGTH_BYTES } from "../src/hkdf.js";

describe("HKDF session key derivation", () => {
  it("derives a key of the default length", () => {
    const secret = new Uint8Array(32).fill(7);
    const salt = new Uint8Array(16).fill(1);
    const key = deriveSessionKey(secret, salt);
    expect(key.length).toBe(SESSION_KEY_LENGTH_BYTES);
  });

  it("is deterministic for identical inputs", () => {
    const secret = new Uint8Array(32).fill(9);
    const salt = new Uint8Array(16).fill(2);
    expect(deriveSessionKey(secret, salt)).toEqual(deriveSessionKey(secret, salt));
  });

  it("produces different keys for different salts", () => {
    const secret = new Uint8Array(32).fill(9);
    const saltA = new Uint8Array(16).fill(1);
    const saltB = new Uint8Array(16).fill(2);
    expect(deriveSessionKey(secret, saltA)).not.toEqual(deriveSessionKey(secret, saltB));
  });

  it("produces different keys for different info strings", () => {
    const secret = new Uint8Array(32).fill(9);
    const salt = new Uint8Array(16).fill(1);
    expect(deriveSessionKey(secret, salt, "context-a")).not.toEqual(
      deriveSessionKey(secret, salt, "context-b"),
    );
  });

  it("respects a custom output length", () => {
    const secret = new Uint8Array(32).fill(3);
    const salt = new Uint8Array(16).fill(4);
    expect(deriveSessionKey(secret, salt, "info", 16).length).toBe(16);
  });

  it("both sides of an ECDH handshake derive the identical session key", () => {
    const alice = generateX25519KeyPair();
    const bob = generateX25519KeyPair();
    const sessionId = new TextEncoder().encode("session-abc");

    const aliceShared = deriveSharedSecret(alice.secretKey, bob.publicKey);
    const bobShared = deriveSharedSecret(bob.secretKey, alice.publicKey);

    const aliceKey = deriveSessionKey(aliceShared, sessionId);
    const bobKey = deriveSessionKey(bobShared, sessionId);

    expect(aliceKey).toEqual(bobKey);
  });
});
