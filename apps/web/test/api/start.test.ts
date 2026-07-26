import { describe, it, expect, vi } from "vitest";
import { POST } from "../../app/api/pairing/start/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/pairing", () => ({
  startPairing: vi.fn((data) => {
    if (data.laptopEphemeralPubKey === "error") throw new Error("mock error");
    return Promise.resolve({
      sessionId: "mock-session-id",
      pairingToken: "mock-pairing-token",
    });
  }),
}));

vi.mock("@/lib/validation", () => ({
  pairingStartSchema: {
    safeParse: vi.fn((body: any) => {
      if (body?.invalid) return { success: false, error: { issues: [{ message: "invalid body" }] } };
      return { success: true, data: body };
    })
  }
}));

vi.mock("@/lib/rateLimit", () => ({
  checkPairingStartRateLimit: vi.fn((ip) => {
    if (ip === "127.0.0.1") return Promise.resolve({ allowed: false });
    return Promise.resolve({ allowed: true });
  }),
}));

describe("POST /api/pairing/start", () => {
  it("rejects when rate limited", async () => {
    const req = new NextRequest("http://localhost/api/pairing/start", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("RATE_LIMITED");
  });

  it("rejects invalid request body", async () => {
    const req = new NextRequest("http://localhost/api/pairing/start", {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify({ invalid: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });

  it("creates a pairing session successfully", async () => {
    const payload = {
      laptopEphemeralPubKey: "mockPubKey",
    };
    const req = new NextRequest("http://localhost/api/pairing/start", {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify(payload),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.sessionId).toBe("mock-session-id");
    expect(json.data.pairingToken).toBe("mock-pairing-token");
  });

  it("handles internal errors gracefully", async () => {
    const payload = {
      laptopEphemeralPubKey: "error", // Triggers mock error
    };
    const req = new NextRequest("http://localhost/api/pairing/start", {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify(payload),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("STORE_UNAVAILABLE");
  });
});
