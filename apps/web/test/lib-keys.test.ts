import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { redisKeys } from "../lib/keys";

describe("redisKeys namespace validation", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("uses 'td' by default when no env is set", () => {
    delete process.env["TETHERDESK_KEY_NAMESPACE"];
    expect(redisKeys.pairing("abc")).toBe("td:pair:abc");
  });

  it("uses custom namespace when env is a valid alphanumeric string", () => {
    process.env["TETHERDESK_KEY_NAMESPACE"] = "preview";
    expect(redisKeys.pairing("abc")).toBe("preview:pair:abc");
  });

  it("accepts hyphens and underscores in namespace", () => {
    process.env["TETHERDESK_KEY_NAMESPACE"] = "my-preview_v2";
    expect(redisKeys.session("xyz")).toBe("my-preview_v2:session:xyz");
  });

  it("falls back to 'td' when namespace contains invalid characters (colons)", () => {
    process.env["TETHERDESK_KEY_NAMESPACE"] = "bad:namespace";
    expect(redisKeys.pairing("abc")).toBe("td:pair:abc");
  });

  it("falls back to 'td' when namespace contains spaces", () => {
    process.env["TETHERDESK_KEY_NAMESPACE"] = "bad namespace";
    expect(redisKeys.pairing("abc")).toBe("td:pair:abc");
  });

  it("falls back to 'td' when namespace contains slashes", () => {
    process.env["TETHERDESK_KEY_NAMESPACE"] = "bad/namespace";
    expect(redisKeys.pairing("abc")).toBe("td:pair:abc");
  });

  it("falls back to 'td' for empty string", () => {
    process.env["TETHERDESK_KEY_NAMESPACE"] = "";
    expect(redisKeys.pairing("abc")).toBe("td:pair:abc");
  });

  it("generates all key types correctly", () => {
    delete process.env["TETHERDESK_KEY_NAMESPACE"];
    expect(redisKeys.pairingUsed("tok")).toBe("td:pair:used:tok");
    expect(redisKeys.presence("dev1")).toBe("td:presence:dev1");
    expect(redisKeys.approvalRequest("sess1")).toBe("td:approval:req:sess1");
    expect(redisKeys.approvalResult("sess1")).toBe("td:approval:res:sess1");
    expect(redisKeys.rateLimitPairStart("1.2.3.4")).toBe("td:ratelimit:pair:start:1.2.3.4");
    expect(redisKeys.rateLimitPairConfirm("1.2.3.4")).toBe("td:ratelimit:pair:confirm:1.2.3.4");
  });
});
