import { describe, expect, it } from "vitest";
import {
  decodePairingQrPayload,
  encodePairingQrPayload,
  type PairingQrPayload,
} from "../src/signaling.js";

describe("PairingQrPayload codec", () => {
  const payload: PairingQrPayload = {
    backendOrigin: "https://example.vercel.app",
    pairingToken: "abc123",
    sessionId: "sess-1",
    laptopEphemeralPubKey: "base64url-key",
  };

  it("round-trips a valid payload (encode → decode)", () => {
    expect(decodePairingQrPayload(encodePairingQrPayload(payload))).toEqual(payload);
  });

  it("encodes as a URL starting with backendOrigin", () => {
    const url = encodePairingQrPayload(payload);
    expect(url).toMatch(/^https:\/\/example\.vercel\.app\/pair\//);
  });

  it("decodes a raw JSON string (backward compat)", () => {
    expect(decodePairingQrPayload(JSON.stringify(payload))).toEqual(payload);
  });

  it("decodes a bare base64url token", () => {
    const b64url = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    expect(decodePairingQrPayload(b64url)).toEqual(payload);
  });

  it("throws on non-object JSON", () => {
    expect(() => decodePairingQrPayload("null")).toThrow(TypeError);
  });

  it("throws when a required field is missing", () => {
    const { backendOrigin: _omit, ...incomplete } = payload;
    expect(() => decodePairingQrPayload(JSON.stringify(incomplete))).toThrow(TypeError);
  });

  it("throws when a required field has the wrong type", () => {
    expect(() =>
      decodePairingQrPayload(JSON.stringify({ ...payload, sessionId: 123 })),
    ).toThrow(TypeError);
  });

  it("throws on a URL with no /pair/ path", () => {
    expect(() => decodePairingQrPayload("https://example.vercel.app/other")).toThrow(TypeError);
  });

  it("throws on invalid base64url data", () => {
    expect(() => decodePairingQrPayload("invalid_base64!@#")).toThrow(TypeError);
  });
});
