import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url } from "../src/encoding.js";
import { generateX25519KeyPair } from "../src/x25519.js";

describe("base64url encoding", () => {
  it("round-trips arbitrary byte lengths (0..8)", () => {
    for (let len = 0; len <= 8; len++) {
      const bytes = new Uint8Array(len).map((_, i) => (i * 37) % 256);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
  });

  it("round-trips a real X25519 public key", () => {
    const { publicKey } = generateX25519KeyPair();
    expect(fromBase64Url(toBase64Url(publicKey))).toEqual(publicKey);
  });

  it("never emits '+', '/', or '=' characters", () => {
    const bytes = new Uint8Array(64).fill(255);
    const encoded = toBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("rejects invalid characters", () => {
    expect(() => fromBase64Url("not!valid base64url")).toThrow(TypeError);
  });
});
