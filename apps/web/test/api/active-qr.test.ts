import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "../../app/api/pairing/active-qr/route";
import { NextRequest } from "next/server";

const mockRedisStore: Record<string, string> = {};

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => ({
    set: vi.fn((key: string, val: string) => { mockRedisStore[key] = val; return Promise.resolve("OK"); }),
    get: vi.fn((key: string) => Promise.resolve(mockRedisStore[key] ?? null)),
    del: vi.fn((key: string) => { delete mockRedisStore[key]; return Promise.resolve(1); }),
    hget: vi.fn(() => Promise.resolve(null)),
    eval: vi.fn(() => Promise.resolve(0)),
  })),
}));

vi.mock("@/lib/auth", () => ({
  verifyAgentSecret: vi.fn(() => true),
}));

describe("POST & GET /api/pairing/active-qr", () => {
  beforeEach(() => {
    // Clear store between tests
    for (const key of Object.keys(mockRedisStore)) {
      delete mockRedisStore[key];
    }
  });

  it("returns ok: true and data: null when no active QR exists", async () => {
    const req = new NextRequest("http://localhost/api/pairing/active-qr");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data).toBeNull();
  });

  it("rejects POST with missing pairingUrl or expiresAt", async () => {
    const req = new NextRequest("http://localhost/api/pairing/active-qr", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("decodes sessionId correctly from base64url containing '_' and '-'", async () => {
    // Generate a payload JSON and encode with base64url (containing _ and -)
    const payload = JSON.stringify({ sessionId: "test_session-123" });
    const b64url = Buffer.from(payload).toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const pairingUrl = `http://localhost/pair/${b64url}`;

    const postReq = new NextRequest("http://localhost/api/pairing/active-qr", {
      method: "POST",
      body: JSON.stringify({ pairingUrl, expiresAt: Date.now() + 60000 }),
    });
    const postRes = await POST(postReq);
    expect(postRes.status).toBe(200);

    const getReq = new NextRequest("http://localhost/api/pairing/active-qr");
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(200);
    const data = await getRes.json();
    expect(data.ok).toBe(true);
    expect(data.data.sessionId).toBe("test_session-123");
  });
});
