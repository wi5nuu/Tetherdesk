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

  it("round-trips a valid payload", () => {
    expect(decodePairingQrPayload(encodePairingQrPayload(payload))).toEqual(payload);
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
});
