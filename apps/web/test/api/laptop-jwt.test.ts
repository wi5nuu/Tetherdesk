import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../../app/api/pairing/laptop-jwt/route";
import { NextRequest } from "next/server";

const mockRedisStore: Record<string, any> = {};

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => ({
    hgetall: vi.fn((key: string) => Promise.resolve(mockRedisStore[key] || null)),
    hget: vi.fn((key: string, field: string) => Promise.resolve(mockRedisStore[key]?.[field] || null)),
  })),
}));

describe("GET /api/pairing/laptop-jwt", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockRedisStore)) {
      delete mockRedisStore[key];
    }
  });

  it("rejects request missing sessionId or pairingToken", async () => {
    const req1 = new NextRequest("http://localhost/api/pairing/laptop-jwt");
    const res1 = await GET(req1);
    expect(res1.status).toBe(400);

    const req2 = new NextRequest("http://localhost/api/pairing/laptop-jwt?sessionId=123");
    const res2 = await GET(req2);
    expect(res2.status).toBe(400);

    const req3 = new NextRequest("http://localhost/api/pairing/laptop-jwt?pairingToken=123");
    const res3 = await GET(req3);
    expect(res3.status).toBe(400);
  });

  it("rejects request with invalid pairing token", async () => {
    mockRedisStore["td:pair:invalid-token"] = null; // No pairing record
    
    const req = new NextRequest("http://localhost/api/pairing/laptop-jwt?sessionId=test-session&pairingToken=invalid-token");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("rejects request when pairing token points to wrong session", async () => {
    mockRedisStore["td:pair:valid-token"] = { sessionId: "other-session" }; 
    
    const req = new NextRequest("http://localhost/api/pairing/laptop-jwt?sessionId=test-session&pairingToken=valid-token");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 404 when session exists but has no laptopJwt", async () => {
    mockRedisStore["td:pair:valid-token"] = { sessionId: "test-session" }; 
    mockRedisStore["td:session:test-session"] = {}; // No laptopJwt field
    
    const req = new NextRequest("http://localhost/api/pairing/laptop-jwt?sessionId=test-session&pairingToken=valid-token");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns the laptopJwt successfully", async () => {
    mockRedisStore["td:pair:valid-token"] = { sessionId: "test-session" }; 
    mockRedisStore["td:session:test-session"] = { laptopJwt: "mock.jwt.token" }; 
    
    const req = new NextRequest("http://localhost/api/pairing/laptop-jwt?sessionId=test-session&pairingToken=valid-token");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.laptopJwt).toBe("mock.jwt.token");
  });
});
