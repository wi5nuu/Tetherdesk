import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { runInit } from "./steps/init.js";
import { runDestroy } from "./steps/destroy.js";
import { runStart } from "./steps/start.js";

// Read version from package.json at runtime so it's always in sync
const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("tetherdesk")
  .description("Zero-infrastructure remote laptop control")
  .version(version);

program
  .command("init")
  .description("First-time setup: deploy backend, install agent, and start pairing")
  .option("--skip-vercel", "Skip Vercel provisioning (assumes already deployed)")
  .option("--backend-url <url>", "Use an existing backend URL instead of provisioning")
  .action(async (options) => {
    console.log(pc.bold(pc.green("\nTetherDesk Setup\n")));
    try {
      await runInit(options);
    } catch (err) {
      console.error(pc.red("\nSetup failed:"), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("destroy")
  .description("Remove the local agent service and delete the Vercel project")
  .option("--yes", "Skip confirmation prompt")
  .action(async (options) => {
    try {
      await runDestroy(options);
    } catch (err) {
      console.error(pc.red("\nDestroy failed:"), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("start")
  .description("Start tunnel + backend + agent for local use (dev mode)")
  .option("--domain <url>", "Use a fixed backend URL instead of a new Cloudflare tunnel")
  .action(async (options: { domain?: string }) => {
    console.log(pc.bold(pc.green("\nTetherDesk\n")));
    try {
      await runStart(options);
    } catch (err) {
      console.error(pc.red("\nFailed to start:"), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("pair")
  .description("Start a new pairing session (agent must already be running)")
  .action(async () => {
    try {
      const { startPairing } = await import("./ipc.js");
      const result = await startPairing();
      console.log(pc.bold(pc.green("\nPairing session started!\n")));
      console.log(pc.cyan(`Pairing token: ${result.pairingToken}`));
      console.log(pc.cyan(`Session ID:    ${result.sessionId}`));
      console.log(pc.yellow("\nThe agent will display a QR code in its terminal output."));
      console.log(pc.yellow("Run 'tetherdesk logs' to view it if the agent is running as a background service.\n"));
    } catch (err) {
      console.error(pc.red("\nFailed to start pairing session:"), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show agent and backend status")
  .action(async () => {
    try {
      const { getAgentStatus } = await import("./ipc.js");
      const status = await getAgentStatus();
      console.log(pc.bold("\nTetherDesk Status\n"));
      const stateColor =
        status.state === "connected" ? pc.green :
        status.state === "reconnecting" ? pc.yellow :
        pc.red;
      console.log(`  Agent state:      ${stateColor(status.state)}`);
      console.log(`  Backend:          ${status.backendOrigin}`);
      console.log(`  Session ID:       ${status.sessionId ?? pc.dim("none")}`);
      console.log(`  Paired devices:   ${status.pairedDeviceCount}`);
      console.log(`  Last heartbeat:   ${status.lastHeartbeatAt ?? pc.dim("none")}`);
      console.log(`  Uptime:           ${formatUptime(status.uptime)}`);
      if (status.reconnectAttempt !== undefined && status.reconnectAttempt > 0) {
        console.log(`  Reconnect attempt: ${pc.yellow(String(status.reconnectAttempt))}`);
      }
      console.log();
    } catch (err) {
      console.error(pc.red("\nCould not reach the TetherDesk agent:"), err instanceof Error ? err.message : String(err));
      console.error(pc.yellow("Start it with: tetherdesk-agent start\n"));
      process.exit(1);
    }
  });

program
  .command("devices")
  .description("List paired devices")
  .action(async () => {
    try {
      const { listDevices } = await import("./ipc.js");
      const devices = await listDevices();
      if (devices.length === 0) {
        console.log(pc.yellow("\nNo paired devices. Run 'tetherdesk pair' to pair a device.\n"));
        return;
      }
      console.log(pc.bold(`\nPaired devices (${devices.length}):\n`));
      for (const d of devices) {
        const statusBadge = d.status === "active" ? pc.green("active") : pc.red("revoked");
        console.log(`  ${pc.bold(d.displayName)} [${statusBadge}]`);
        console.log(`    ID:          ${d.id}`);
        console.log(`    Paired at:   ${d.pairedAt}`);
        console.log(`    Last seen:   ${d.lastSeenAt ?? pc.dim("never")}`);
      }
      console.log();
    } catch (err) {
      console.error(pc.red("\nCould not reach the TetherDesk agent:"), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("config")
  .description("Get or set TetherDesk configuration values")
  .argument("<key>", "Configuration key (e.g. backendOrigin, turnUrl)")
  .argument("[value]", "Value to set (omit to read current value)")
  .addHelpText("after", `
Known keys:
  backendOrigin   The Vercel backend URL (e.g. https://my-app.vercel.app)
  agentSecret     The shared secret for agent-to-backend authentication
  turnUrl         TURN server URL for relay fallback (e.g. turn:myserver.example.com)
  turnUsername    TURN server username
  turnCredential  TURN server credential/password
  logLevel        Log verbosity: error | warn | info | debug

Example:
  tetherdesk config backendOrigin https://my-app.vercel.app
  tetherdesk config turnUrl turn:relay.example.com:3478
`)
  .action(async (key: string, value: string | undefined) => {
    try {
      const { readConfig, writeConfig } = await import("./config.js");
      if (value === undefined) {
        // Read mode
        const cfg = await readConfig();
        const current = (cfg as Record<string, unknown>)[key];
        if (current === undefined) {
          console.log(pc.yellow(`${key} is not set`));
        } else {
          console.log(`${key} = ${String(current)}`);
        }
      } else {
        // Write mode
        await writeConfig(key, value);
        console.log(pc.green(`✓ ${key} set to ${value}`));
      }
    } catch (err) {
      console.error(pc.red("Config error:"), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("logs")
  .description("Tail the local agent logs")
  .option("-n, --lines <number>", "Number of trailing lines to show on start", "20")
  .action(async (options: { lines: string }) => {
    const { openSync, readSync, closeSync, statSync: fstatSync, watch: fsWatch } = await import("node:fs");
    const { readFile } = await import("node:fs/promises");

    const logsPath = join(homedir(), ".tetherdesk", "logs", "agent.log");
    console.log(pc.cyan(`Log file: ${logsPath}\n`));

    if (!existsSync(logsPath)) {
      console.log(pc.yellow("Log file does not exist yet. Start the agent first."));
      console.log(pc.yellow(`Expected location: ${logsPath}`));
      process.exit(0);
    }

    // Print the last N lines from the file
    const tailLines = Math.max(1, parseInt(options.lines, 10) || 20);
    const content = await readFile(logsPath, "utf8");
    const lines = content.split("\n");
    const tail = lines.slice(Math.max(0, lines.length - tailLines - 1));
    process.stdout.write(tail.join("\n"));
    if (!tail[tail.length - 1]?.endsWith("\n")) process.stdout.write("\n");

    // Watch for new content (like tail -f)
    console.log(pc.dim("\n--- following log (Ctrl+C to stop) ---"));
    let fileSize = fstatSync(logsPath).size;
    fsWatch(logsPath, () => {
      try {
        const newSize = fstatSync(logsPath).size;
        if (newSize <= fileSize) {
          // File was truncated/rotated — reset position
          fileSize = 0;
        }
        if (newSize > fileSize) {
          const fd = openSync(logsPath, "r");
          const buf = Buffer.alloc(newSize - fileSize);
          readSync(fd, buf, 0, buf.length, fileSize);
          closeSync(fd);
          process.stdout.write(buf.toString("utf8"));
          fileSize = newSize;
        }
      } catch {
        // Log file may have been rotated; ignore transient errors
      }
    });
  });

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

program.parse();
