import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../../app/api/turn-credentials/route";
import { NextRequest } from "next/server";
import { verifyAgentSecret, authenticateRequest } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  verifyAgentSecret: vi.fn(() => true),
  authenticateRequest: vi.fn(() => Promise.resolve({ ok: true, claims: { role: "laptop", sessionId: "test-session" } })),
}));

describe("GET /api/turn-credentials", () => {
  beforeEach(() => {
    vi.mocked(verifyAgentSecret).mockReturnValue(true);
    vi.mocked(authenticateRequest).mockResolvedValue({ ok: true, claims: { role: "laptop", sessionId: "test-session" } });
  });

  it("returns ICE servers with STUN and TURN", async () => {
    const req = new NextRequest("http://localhost/api/turn-credentials", {
      headers: { Authorization: "Bearer test-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.iceServers)).toBe(true);
    expect(body.data.iceServers.length).toBeGreaterThanOrEqual(3);
    const turnServers = body.data.iceServers.filter((s: { urls: string }) =>
      s.urls.startsWith("turn:")
    );
    expect(turnServers.length).toBeGreaterThanOrEqual(1);
    expect(turnServers[0].username).toBeTypeOf("string");
    expect(turnServers[0].credential).toBeTypeOf("string");
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(verifyAgentSecret).mockReturnValue(false);
    vi.mocked(authenticateRequest).mockResolvedValue({ ok: false });

    const req = new NextRequest("http://localhost/api/turn-credentials");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});
