import { describe, it, expect } from "vitest";
import { TetherDeskAgent } from "../src/agent.js";

describe("TetherDeskAgent", () => {
  it("throws if startPairing is called before initialize", async () => {
    const agent = new TetherDeskAgent({ backendOrigin: "https://example.vercel.app" });
    await expect(agent.startPairing()).rejects.toThrow("not initialized");
  });

  it("initializes without throwing", async () => {
    const agent = new TetherDeskAgent({ backendOrigin: "https://example.vercel.app" });
    await expect(agent.initialize()).resolves.toBeUndefined();
  });

  it("stop is safe to call when no signaling connection is active", async () => {
    const agent = new TetherDeskAgent({ backendOrigin: "https://example.vercel.app" });
    await expect(agent.stop()).resolves.toBeUndefined();
  });
});
