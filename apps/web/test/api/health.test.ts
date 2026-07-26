import { describe, it, expect, vi } from "vitest";
import { GET } from "../../app/api/health/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => ({
    ping: vi.fn().mockResolvedValue("PONG"),
  })),
}));

describe("GET /api/health", () => {
  it("returns 200 OK when Redis is healthy", async () => {
    const request = new NextRequest("http://localhost/api/health");
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
  });
});
