import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  SessionTokenInvalidError,
  signSessionToken,
  verifySessionToken,
} from "../src/session-token.js";

const secret = new TextEncoder().encode("test-signing-secret-at-least-32-bytes-long!!");
const otherSecret = new TextEncoder().encode("a-completely-different-signing-secret-value");

describe("session bearer tokens", () => {
  it("round-trips valid claims", async () => {
    const token = await signSessionToken({ sessionId: "sess-1", role: "laptop" }, secret);
    const claims = await verifySessionToken(token, secret);
    expect(claims).toEqual({ sessionId: "sess-1", role: "laptop" });
  });

  it("supports the phone role", async () => {
    const token = await signSessionToken({ sessionId: "sess-2", role: "phone" }, secret);
    const claims = await verifySessionToken(token, secret);
    expect(claims.role).toBe("phone");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSessionToken({ sessionId: "sess-3", role: "laptop" }, secret);
    await expect(verifySessionToken(token, otherSecret)).rejects.toThrow(
      SessionTokenInvalidError,
    );
  });

  it("rejects invalid ttlSeconds values", async () => {
    // Negative TTL
    await expect(
      signSessionToken({ sessionId: "sess-4", role: "laptop" }, secret, -1)
    ).rejects.toThrow("ttlSeconds must be between");
    
    // Too small (below 60s minimum)
    await expect(
      signSessionToken({ sessionId: "sess-5", role: "laptop" }, secret, 30)
    ).rejects.toThrow("ttlSeconds must be between");
    
    // Too large (above 30 days maximum)
    await expect(
      signSessionToken({ sessionId: "sess-6", role: "laptop" }, secret, 31 * 24 * 60 * 60)
    ).rejects.toThrow("ttlSeconds must be between");
    
    // Non-finite
    await expect(
      signSessionToken({ sessionId: "sess-7", role: "laptop" }, secret, Infinity)
    ).rejects.toThrow("ttlSeconds must be between");
  });

  it("rejects an expired token", async () => {
    // Build a token with exp set 10 seconds in the past, bypassing signSessionToken's
    // TTL validation. This avoids clock mocking — jose uses its own internal clock
    // based on Date.now(), but we craft the exp claim directly here.
    const expiredToken = await new SignJWT({ sessionId: "sess-exp", role: "laptop" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 20)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(secret);

    await expect(verifySessionToken(expiredToken, secret)).rejects.toThrow(
      SessionTokenInvalidError,
    );
  });

  it("rejects a malformed token string", async () => {
    await expect(verifySessionToken("not-a-jwt", secret)).rejects.toThrow(
      SessionTokenInvalidError,
    );
  });
});
