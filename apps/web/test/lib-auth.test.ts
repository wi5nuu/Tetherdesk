import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyAgentSecret } from "../lib/auth";

describe("verifyAgentSecret", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  function makeRequest(authHeader?: string): Request {
    const headers: Record<string, string> = {};
    if (authHeader !== undefined) {
      headers["authorization"] = authHeader;
    }
    return new Request("http://localhost/test", { headers });
  }

  it("returns true for correct Bearer token", () => {
    process.env["AGENT_SECRET"] = "test-secret-123";
    expect(verifyAgentSecret(makeRequest("Bearer test-secret-123"))).toBe(true);
  });

  it("returns false when AGENT_SECRET is not set", () => {
    delete process.env["AGENT_SECRET"];
    expect(verifyAgentSecret(makeRequest("Bearer anything"))).toBe(false);
  });

  it("returns false when AGENT_SECRET is empty", () => {
    process.env["AGENT_SECRET"] = "";
    expect(verifyAgentSecret(makeRequest("Bearer "))).toBe(false);
  });

  it("returns false when no Authorization header", () => {
    process.env["AGENT_SECRET"] = "test-secret-123";
    expect(verifyAgentSecret(makeRequest())).toBe(false);
  });

  it("returns false for non-Bearer auth scheme", () => {
    process.env["AGENT_SECRET"] = "test-secret-123";
    expect(verifyAgentSecret(makeRequest("Basic dGVzdDp0ZXN0"))).toBe(false);
  });

  it("returns false for wrong secret", () => {
    process.env["AGENT_SECRET"] = "correct-secret";
    expect(verifyAgentSecret(makeRequest("Bearer wrong-secret!"))).toBe(false);
  });

  it("returns false for different length secret (timing attack mitigation)", () => {
    process.env["AGENT_SECRET"] = "short";
    expect(verifyAgentSecret(makeRequest("Bearer a-much-longer-secret"))).toBe(false);
  });
});
