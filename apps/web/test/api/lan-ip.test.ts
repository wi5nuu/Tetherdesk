import { describe, it, expect } from "vitest";
import { GET } from "../../app/api/lan-ip/route";
import { NextRequest } from "next/server";

describe("GET /api/lan-ip", () => {
  it("returns LAN IP successfully", async () => {
    const request = new NextRequest("http://localhost/api/lan-ip");
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.data).toHaveProperty("lanIp");
    expect(typeof data.data.lanIp).toBe("string");
  });
});
