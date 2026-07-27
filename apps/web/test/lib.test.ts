import { describe, it, expect } from "vitest";
import { redisKeys } from "../lib/keys";
import { generatePairingToken, generateSessionId } from "../lib/ids";
import {
  PAIRING_TOKEN_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  RATE_LIMIT_MAX_ATTEMPTS,
} from "../lib/constants";

describe("constants", () => {
  it("pairing token TTL is 60 seconds", () => {
    expect(PAIRING_TOKEN_TTL_SECONDS).toBe(60);
  });

  it("session TTL is 24 hours", () => {
    expect(SESSION_TTL_SECONDS).toBe(24 * 60 * 60);
  });

  it("rate limit max attempts is 30", () => {
    expect(RATE_LIMIT_MAX_ATTEMPTS).toBe(30);
  });
});

describe("redisKeys", () => {
  it("generates pairing key with correct prefix", () => {
    expect(redisKeys.pairing("abc123")).toBe("td:pair:abc123");
  });

  it("generates session key with correct prefix", () => {
    expect(redisKeys.session("sess123")).toBe("td:session:sess123");
  });

  it("generates mailbox key with sessionId and recipient", () => {
    expect(redisKeys.mailbox("sess123", "laptop")).toBe("td:mailbox:sess123:laptop");
  });

  it("generates revoked key with correct prefix", () => {
    expect(redisKeys.revoked("device123")).toBe("td:revoked:device123");
  });

  it("generates rate limit key with ip", () => {
    expect(redisKeys.rateLimitPair("1.2.3.4")).toBe("td:ratelimit:pair:1.2.3.4");
  });
});

describe("generatePairingToken", () => {
  it("generates a non-empty base64url string", () => {
    const token = generatePairingToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    expect(token).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generatePairingToken()));
    expect(tokens.size).toBe(20);
  });
});

describe("generateSessionId", () => {
  it("generates a non-empty base64url string", () => {
    const id = generateSessionId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    expect(id).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});
