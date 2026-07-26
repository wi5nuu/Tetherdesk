import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "../../app/api/pairing/approval/route";
import { NextRequest } from "next/server";

const mockRedisStore: Record<string, string> = {};

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => ({
    set: vi.fn((key: string, val: string) => { mockRedisStore[key] = val; return Promise.resolve("OK"); }),
    get: vi.fn((key: string) => Promise.resolve(mockRedisStore[key] ?? null)),
    del: vi.fn((key: string) => { delete mockRedisStore[key]; return Promise.resolve(1); }),
  })),
}));

vi.mock("@/lib/auth", () => ({
  verifyAgentSecret: vi.fn(() => true),
  authenticateRequest: vi.fn((req: NextRequest) => {
    // Basic mock: return success if it's the right session id
    const body = (req as any)._parsedBody;
    return Promise.resolve({
      ok: true,
      claims: { role: "laptop", sessionId: body?.sessionId || "test-session" }
    });
  }),
}));

describe("POST & GET /api/pairing/approval", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockRedisStore)) {
      delete mockRedisStore[key];
    }
  });

  it("GET returns idle status when no request exists", async () => {
    const req = new NextRequest("http://localhost/api/pairing/approval?sessionId=test-session");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("idle");
  });

  it("POST action=request creates a pending request", async () => {
    // 1. Post request
    const postReq = new NextRequest("http://localhost/api/pairing/approval", {
      method: "POST",
      body: JSON.stringify({ action: "request", sessionId: "test-session", deviceFingerprint: "fingerprint-123" }),
    });
    const postRes = await POST(postReq);
    expect(postRes.status).toBe(200);

    // 2. Get status should be pending
    const getReq = new NextRequest("http://localhost/api/pairing/approval?sessionId=test-session");
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(200);
    const json = await getRes.json();
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("pending");
    expect(json.data.sessionId).toBe("test-session");
    expect(json.data.deviceFingerprint).toBe("fingerprint-123");
  });

  it("POST action=respond updates status to approved or declined", async () => {
    // Add pending request manually to mock store
    mockRedisStore["td:approval:req:test-session"] = JSON.stringify({ sessionId: "test-session", requestedAt: Date.now() });

    // Respond approve
    const postReq = new NextRequest("http://localhost/api/pairing/approval", {
      method: "POST",
      body: JSON.stringify({ action: "respond", sessionId: "test-session", approved: true }),
    });
    // Store parsed body for the mock to read
    (postReq as any)._parsedBody = { action: "respond", sessionId: "test-session", approved: true };

    const postRes = await POST(postReq);
    expect(postRes.status).toBe(200);

    // Get status should be approved
    const getReq = new NextRequest("http://localhost/api/pairing/approval?sessionId=test-session");
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(200);
    const json = await getRes.json();
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("approved");

    // Request should have been deleted
    expect(mockRedisStore["td:approval:req:test-session"]).toBeUndefined();
  });

  it("rejects POST with invalid action", async () => {
    const postReq = new NextRequest("http://localhost/api/pairing/approval", {
      method: "POST",
      body: JSON.stringify({ action: "invalid_action", sessionId: "test-session" }),
    });
    const postRes = await POST(postReq);
    expect(postRes.status).toBe(400);
  });

  it("GET rejects sessionId exceeding 128 chars", async () => {
    const longId = "x".repeat(129);
    const req = new NextRequest(`http://localhost/api/pairing/approval?sessionId=${longId}`);
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("POST rejects sessionId exceeding 128 chars", async () => {
    const longId = "x".repeat(129);
    const postReq = new NextRequest("http://localhost/api/pairing/approval", {
      method: "POST",
      body: JSON.stringify({ action: "request", sessionId: longId }),
    });
    const postRes = await POST(postReq);
    expect(postRes.status).toBe(400);
  });
});
