#!/usr/bin/env node
import { Command } from "commander";
import { TetherDeskAgent } from "./agent.js";
import {
  getAgentStatus,
  listDevices,
  revokeDevice,
  stopAgent,
  startPairing,
} from "./cli/ipc.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = join(homedir(), ".tetherdesk", "config.json");

interface AgentConfigFile {
  backendOrigin?: string;
  agentSecret?: string;
}

async function loadConfig(): Promise<AgentConfigFile> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    // Basic size limit to prevent DoS via huge config files
    if (raw.length > 10_000) {
      console.error("Config file too large (>10KB), ignoring");
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    // Validate structure
    if (typeof parsed !== "object" || parsed === null) {
      console.error("Config file is not a JSON object, ignoring");
      return {};
    }
    const obj = parsed as Record<string, unknown>;
    return {
      ...(typeof obj.backendOrigin === "string" ? { backendOrigin: obj.backendOrigin } : {}),
      ...(typeof obj.agentSecret === "string" ? { agentSecret: obj.agentSecret } : {}),
    };
  } catch {
    // File doesn't exist or JSON is malformed — not fatal, return empty config
    return {};
  }
}

const program = new Command();

program
  .name("tetherdesk-agent")
  .description("TetherDesk laptop agent — screen capture and remote control")
  .version("0.1.0");

// ---------------------------------------------------------------------------
// start — main foreground agent process
// ---------------------------------------------------------------------------
program
  .command("start")
  .description("Start the agent (foreground — normally managed by OS service)")
  .option("-b, --backend <url>", "Backend origin URL")
  .action(async (options: { backend?: string }) => {
    const config = await loadConfig();
    const backendOrigin =
      options.backend ??
      process.env["TETHERDESK_BACKEND_URL"] ??
      config.backendOrigin;

    if (!backendOrigin) {
      console.error(
        "Error: Backend URL not configured.\n" +
          "Set TETHERDESK_BACKEND_URL, use --backend, or run 'npx tetherdesk init' first.",
      );
      process.exit(1);
    }

    const agentSecret =
      process.env["AGENT_SECRET"] ??
      config.agentSecret;

    if (!agentSecret) {
      console.error(
        "Error: AGENT_SECRET not configured.\n" +
          "Set AGENT_SECRET env var or add it to ~/.tetherdesk/config.json.",
      );
      process.exit(1);
    }

    const agent = new TetherDeskAgent({ backendOrigin, agentSecret });

    try {
      await agent.initialize();
      await agent.startPairing();

      // Keep process alive; SIGTERM/SIGINT handled for clean shutdown
      const shutdown = async (signal: string) => {
        console.log(`\n[${signal}] Shutting down agent…`);
        await agent.stop();
        process.exit(0);
      };

      process.on("SIGINT", () => void shutdown("SIGINT"));
      process.on("SIGTERM", () => void shutdown("SIGTERM"));

      // Keep the event loop alive
      setInterval(() => {}, 30_000);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// status — IPC call to running agent
// ---------------------------------------------------------------------------
program
  .command("status")
  .description("Show agent and connection status")
  .action(async () => {
    try {
      const status = await getAgentStatus();
      console.log("TetherDesk Agent Status");
      console.log("─────────────────────────────────────");
      console.log(`State:          ${status.state}`);
      console.log(`Backend:        ${status.backendOrigin}`);
      console.log(`Session ID:     ${status.sessionId ?? "(none)"}`);
      console.log(`Paired devices: ${status.pairedDeviceCount}`);
      console.log(`Uptime:         ${Math.round(status.uptime)}s`);
      if (status.lastHeartbeatAt) {
        console.log(`Last heartbeat: ${status.lastHeartbeatAt}`);
      }
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// pair — start a new pairing session on the running agent
// ---------------------------------------------------------------------------
program
  .command("pair")
  .description("Start a new pairing session (agent must already be running)")
  .action(async () => {
    try {
      const result = await startPairing();
      console.log(`Pairing started — session ${result.sessionId}`);
      console.log("The agent will display a QR code in its terminal output.");
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// devices — list paired devices
// ---------------------------------------------------------------------------
program
  .command("devices")
  .description("List paired devices")
  .action(async () => {
    try {
      const devices = await listDevices();
      if (devices.length === 0) {
        console.log("No paired devices.");
        return;
      }
      console.log(`Paired devices (${devices.length}):`);
      for (const d of devices) {
        const revoked = d.status === "revoked" ? " [REVOKED]" : "";
        const lastSeen = d.lastSeenAt ? ` — last seen ${d.lastSeenAt}` : "";
        console.log(`  ${d.id}  ${d.displayName}${revoked}${lastSeen}`);
      }
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// revoke — revoke a device
// ---------------------------------------------------------------------------
program
  .command("revoke <deviceId>")
  .description("Revoke a paired device immediately")
  .action(async (deviceId: string) => {
    try {
      await revokeDevice(deviceId);
      console.log(`Device ${deviceId} revoked.`);
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// stop — gracefully stop the running agent
// ---------------------------------------------------------------------------
program
  .command("stop")
  .description("Stop the running agent")
  .action(async () => {
    try {
      await stopAgent();
      console.log("Agent stopped.");
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// logs — print the log file path (tail is left to the OS)
// ---------------------------------------------------------------------------
program
  .command("logs")
  .description("Show path to agent log files")
  .action(() => {
    const logsDir = join(homedir(), ".tetherdesk", "logs");
    console.log(`Agent logs: ${logsDir}/agent.log`);
    console.log(`Error logs: ${logsDir}/agent-error.log`);
    console.log(`\nTo follow in real time (Unix): tail -f ${logsDir}/agent.log`);
    console.log(`Windows: Get-Content ${logsDir}\\agent.log -Wait`);
  });

program.parse();
