import { describe, it, expect } from "vitest";
import { parseTunnelUrl } from "../src/steps/tunnel.js";

describe("parseTunnelUrl", () => {
  // ── Happy paths ───────────────────────────────────────────────────────────

  it("parses modern key=value form", () => {
    const line =
      "2024-01-01T00:00:00Z INF Connection registered connIndex=0 ip=1.2.3.4 url=https://abc-def-123.trycloudflare.com";
    expect(parseTunnelUrl(line)).toBe("https://abc-def-123.trycloudflare.com");
  });

  it("parses legacy box form — bare URL on its own line", () => {
    const line = "| https://xyz-tunnel-456.trycloudflare.com |";
    expect(parseTunnelUrl(line)).toBe("https://xyz-tunnel-456.trycloudflare.com");
  });

  it("parses URL with long subdomain", () => {
    const line = "url=https://a-very-long-subdomain-name-here.trycloudflare.com";
    expect(parseTunnelUrl(line)).toBe("https://a-very-long-subdomain-name-here.trycloudflare.com");
  });

  it("parses legacy form when URL is the entire line (no spaces)", () => {
    const line = "https://simple.trycloudflare.com";
    expect(parseTunnelUrl(line)).toBe("https://simple.trycloudflare.com");
  });

  it("modern form takes precedence over legacy form when both match", () => {
    // Construct a line that matches both patterns; modern (url=) should win.
    const line =
      "url=https://modern.trycloudflare.com also https://legacy.trycloudflare.com";
    expect(parseTunnelUrl(line)).toBe("https://modern.trycloudflare.com");
  });

  // ── Negative / edge cases ─────────────────────────────────────────────────

  it("returns null for an empty line", () => {
    expect(parseTunnelUrl("")).toBeNull();
  });

  it("returns null for a cloudflared log line without a URL", () => {
    const line =
      "2024-01-01T00:00:00Z INF Starting tunnel tunnelID=abc123def456";
    expect(parseTunnelUrl(line)).toBeNull();
  });

  it("returns null for an http:// URL (not https)", () => {
    const line = "url=http://insecure.trycloudflare.com";
    expect(parseTunnelUrl(line)).toBeNull();
  });

  it("returns null for a URL on a different domain", () => {
    const line = "url=https://example.com";
    expect(parseTunnelUrl(line)).toBeNull();
  });

  it("returns null for a URL with trycloudflare.com as a path segment, not hostname", () => {
    const line = "url=https://attacker.com/path/trycloudflare.com/payload";
    expect(parseTunnelUrl(line)).toBeNull();
  });
});
