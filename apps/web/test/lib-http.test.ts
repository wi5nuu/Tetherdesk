import { describe, it, expect } from "vitest";
import { getClientIp, parseJsonBody, jsonOk, jsonError } from "../lib/http";
import { ErrorCode } from "@tetherdesk/protocol";

describe("getClientIp", () => {
  function makeRequest(headers: Record<string, string>): Request {
    return new Request("http://localhost/test", { headers });
  }

  it("returns x-real-ip when present", () => {
    expect(getClientIp(makeRequest({ "x-real-ip": "1.2.3.4" }))).toBe("1.2.3.4");
  });

  it("trims whitespace from x-real-ip", () => {
    expect(getClientIp(makeRequest({ "x-real-ip": "  5.6.7.8  " }))).toBe("5.6.7.8");
  });

  it("returns first x-forwarded-for entry when x-real-ip is absent", () => {
    expect(getClientIp(makeRequest({ "x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3" }))).toBe("10.0.0.1");
  });

  it("prefers x-real-ip over x-forwarded-for", () => {
    expect(getClientIp(makeRequest({
      "x-real-ip": "1.1.1.1",
      "x-forwarded-for": "2.2.2.2",
    }))).toBe("1.1.1.1");
  });

  it("returns 127.0.0.1 when no IP headers are present", () => {
    expect(getClientIp(makeRequest({}))).toBe("127.0.0.1");
  });

  it("returns 127.0.0.1 when x-real-ip is empty string", () => {
    expect(getClientIp(makeRequest({ "x-real-ip": "" }))).toBe("127.0.0.1");
  });

  it("returns 127.0.0.1 when x-forwarded-for is empty string", () => {
    expect(getClientIp(makeRequest({ "x-forwarded-for": "" }))).toBe("127.0.0.1");
  });
});

describe("parseJsonBody", () => {
  it("parses valid JSON body", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ foo: "bar" });
  });

  it("returns undefined for malformed JSON", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: "not valid json{{{",
      headers: { "Content-Type": "application/json" },
    });
    const result = await parseJsonBody(req);
    expect(result).toBeUndefined();
  });

  it("returns undefined for empty body", async () => {
    const req = new Request("http://localhost/test", { method: "POST" });
    const result = await parseJsonBody(req);
    expect(result).toBeUndefined();
  });
});

describe("jsonOk", () => {
  it("wraps data in { ok: true, data } with default 200 status", async () => {
    const res = jsonOk({ count: 42 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { count: 42 } });
  });

  it("supports custom status codes", async () => {
    const res = jsonOk({ id: "abc" }, 201);
    expect(res.status).toBe(201);
  });
});

describe("jsonError", () => {
  it("returns proper error envelope with correct HTTP status", async () => {
    const res = jsonError(ErrorCode.VALIDATION_FAILED, "bad input");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.error.message).toBe("bad input");
  });

  it("maps RATE_LIMITED to 429", async () => {
    const res = jsonError(ErrorCode.RATE_LIMITED, "slow down");
    expect(res.status).toBe(429);
  });

  it("maps UNAUTHORIZED to 401", async () => {
    const res = jsonError(ErrorCode.UNAUTHORIZED, "no token");
    expect(res.status).toBe(401);
  });

  it("maps STORE_UNAVAILABLE to 503", async () => {
    const res = jsonError(ErrorCode.STORE_UNAVAILABLE, "redis down");
    expect(res.status).toBe(503);
  });
});
