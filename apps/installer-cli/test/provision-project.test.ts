import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  step03ProvisionProject,
  vercelFetch,
} from "../src/steps/03-provision-project.js";
import type { InitState } from "../src/steps/init.js";

// ---------------------------------------------------------------------------
// vercelFetch — unit tests for network error handling
// ---------------------------------------------------------------------------

describe("vercelFetch", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns a successful Response on 200", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const resp = await vercelFetch("tok", "/v9/projects/foo");
    expect(resp.ok).toBe(true);
    expect(resp.status).toBe(200);
  });

  it("returns a non-ok Response on 404 without throwing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    const resp = await vercelFetch("tok", "/v9/projects/missing");
    expect(resp.ok).toBe(false);
    expect(resp.status).toBe(404);
  });

  it("throws a user-friendly message on AbortError (timeout)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
    );
    await expect(vercelFetch("tok", "/v9/projects/foo")).rejects.toThrow(
      "timed out after 30 seconds",
    );
  });

  it("throws a user-friendly message on ENOTFOUND (DNS failure)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error("fetch failed: ENOTFOUND api.vercel.com"),
    );
    await expect(vercelFetch("tok", "/v9/projects/foo")).rejects.toThrow(
      "Could not reach Vercel API",
    );
  });

  it("throws a user-friendly message on 'fetch failed' network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));
    await expect(vercelFetch("tok", "/v9/projects/foo")).rejects.toThrow(
      "Could not reach Vercel API",
    );
  });

  it("re-throws unknown errors unchanged", async () => {
    const mystery = new TypeError("something entirely unexpected");
    globalThis.fetch = vi.fn().mockRejectedValue(mystery);
    await expect(vercelFetch("tok", "/v9/projects/foo")).rejects.toThrow(
      "something entirely unexpected",
    );
  });

  it("sends Authorization header with Bearer token", async () => {
    const spy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = spy;
    await vercelFetch("my-secret-token", "/v9/projects/foo");
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer my-secret-token",
    );
  });
});

// ---------------------------------------------------------------------------
// step03ProvisionProject — integration-style unit tests
// ---------------------------------------------------------------------------

describe("step03ProvisionProject", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function makeState(overrides: Partial<InitState> = {}): InitState {
    return { vercelToken: "test-token", ...overrides } as InitState;
  }

  it("throws if vercelToken is missing", async () => {
    const state = makeState({ vercelToken: undefined });
    await expect(step03ProvisionProject(state)).rejects.toThrow(
      "Vercel token is required",
    );
  });

  it("reuses existing project when GET returns 200", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "proj-existing-123" }), { status: 200 }),
    );
    const state = makeState();
    await step03ProvisionProject(state);
    expect(state.projectId).toBe("proj-existing-123");
    expect(state.projectUrl).toMatch(/\.vercel\.app$/);
    // Should NOT have called POST to create a new project
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("creates a new project when GET returns 404", async () => {
    const fetchMock = vi
      .fn()
      // First call: GET existing project → 404
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      // Second call: POST create project → 200
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "proj-new-456" }), { status: 200 }),
      );
    globalThis.fetch = fetchMock;
    const state = makeState();
    await step03ProvisionProject(state);
    expect(state.projectId).toBe("proj-new-456");
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  it("throws if project creation returns non-ok status", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("internal server error", { status: 500 }));
    const state = makeState();
    await expect(step03ProvisionProject(state)).rejects.toThrow(
      "Failed to create Vercel project",
    );
  });

  it("propagates network errors from vercelFetch", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
    );
    const state = makeState();
    await expect(step03ProvisionProject(state)).rejects.toThrow(
      "timed out after 30 seconds",
    );
  });
});
