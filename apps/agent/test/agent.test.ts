import { describe, it, expect, afterEach } from "vitest";
import { TetherDeskAgent } from "../src/agent.js";
import { randomBytes } from "node:crypto";

// Use a unique pipe/socket path per test run to avoid EADDRINUSE if the
// real agent is already running on the default path (\\.\pipe\tetherdesk-agent).
function testIpcPath(): string {
  const id = randomBytes(4).toString("hex");
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\tetherdesk-agent-test-${id}`;
  }
  const { tmpdir } = require("node:os");
  return `${tmpdir()}/tetherdesk-agent-test-${id}.sock`;
}

describe("TetherDeskAgent", () => {
  let agents: TetherDeskAgent[] = [];
  afterEach(async () => {
    for (const agent of agents) {
      await agent.stop().catch(() => {/* best-effort */});
    }
    agents = [];
  });

  it("throws if startPairing is called before initialize", async () => {
    const agent = new TetherDeskAgent({ backendOrigin: "https://example.vercel.app", agentSecret: "test" });
    agents.push(agent);
    await expect(agent.startPairing()).rejects.toThrow("not initialized");
  });

  it("initializes without throwing", async () => {
    const agent = new TetherDeskAgent({
      backendOrigin: "https://example.vercel.app",
      agentSecret: "test",
      ipcPath: testIpcPath(),
    });
    agents.push(agent);
    await expect(agent.initialize()).resolves.toBeUndefined();
  });

  it("stop is safe to call when no signaling connection is active", async () => {
    const agent = new TetherDeskAgent({ backendOrigin: "https://example.vercel.app", agentSecret: "test" });
    agents.push(agent);
    await expect(agent.stop()).resolves.toBeUndefined();
  });
});
