import { describe, it, expect } from "vitest";

describe("installer CLI smoke tests", () => {
  it("prerequisite check module exports a function", async () => {
    const mod = await import("../src/steps/01-prereq-check.js");
    expect(typeof mod.step01PrereqCheck).toBe("function");
  });

  it("init module exports runInit function", async () => {
    const mod = await import("../src/steps/init.js");
    expect(typeof mod.runInit).toBe("function");
  });

  it("destroy module exports runDestroy function", async () => {
    const mod = await import("../src/steps/destroy.js");
    expect(typeof mod.runDestroy).toBe("function");
  });
});
