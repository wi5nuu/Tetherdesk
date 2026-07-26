import { describe, it, expect } from "vitest";
import {
  pairingStartSchema,
  pairingConfirmSchema,
  signalPollQuerySchema,
} from "../lib/validation";

describe("pairingStartSchema", () => {
  it("accepts valid input", () => {
    const result = pairingStartSchema.safeParse({
      laptopPubKey: "validBase64urlKey123",
      laptopEphemeralPubKey: "anotherValidKey456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing laptopPubKey", () => {
    const result = pairingStartSchema.safeParse({
      laptopEphemeralPubKey: "anotherValidKey456",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-base64url characters", () => {
    const result = pairingStartSchema.safeParse({
      laptopPubKey: "invalid key with spaces!",
      laptopEphemeralPubKey: "validKey",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string fields", () => {
    const result = pairingStartSchema.safeParse({
      laptopPubKey: "",
      laptopEphemeralPubKey: "validKey",
    });
    expect(result.success).toBe(false);
  });

  it("rejects overly long fields (> 256 chars)", () => {
    const result = pairingStartSchema.safeParse({
      laptopPubKey: "a".repeat(257),
      laptopEphemeralPubKey: "validKey",
    });
    expect(result.success).toBe(false);
  });
});

describe("pairingConfirmSchema", () => {
  it("accepts valid input", () => {
    const result = pairingConfirmSchema.safeParse({
      pairingToken: "tokenABC",
      phonePubKey: "phoneKeyXYZ",
      phoneEphemeralPubKey: "phoneEphKey123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing pairingToken", () => {
    const result = pairingConfirmSchema.safeParse({
      phonePubKey: "phoneKeyXYZ",
      phoneEphemeralPubKey: "phoneEphKey123",
    });
    expect(result.success).toBe(false);
  });
});

describe("signalPollQuerySchema", () => {
  it("accepts valid laptop recipient", () => {
    const result = signalPollQuerySchema.safeParse({
      sessionId: "sess123",
      recipient: "laptop",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid phone recipient", () => {
    const result = signalPollQuerySchema.safeParse({
      sessionId: "sess123",
      recipient: "phone",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid recipient", () => {
    const result = signalPollQuerySchema.safeParse({
      sessionId: "sess123",
      recipient: "tablet",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty sessionId", () => {
    const result = signalPollQuerySchema.safeParse({
      sessionId: "",
      recipient: "laptop",
    });
    expect(result.success).toBe(false);
  });

  it("rejects overly long sessionId (> 128 chars)", () => {
    const result = signalPollQuerySchema.safeParse({
      sessionId: "x".repeat(129),
      recipient: "laptop",
    });
    expect(result.success).toBe(false);
  });
});
