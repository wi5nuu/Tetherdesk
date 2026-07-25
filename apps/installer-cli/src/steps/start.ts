import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, mkdir, readFile, access as fsAccess } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import pc from "picocolors";

const AGENT_DIR = join(homedir(), ".tetherdesk");
const CONFIG_PATH = join(AGENT_DIR, "config.json");

// Default backend — the Vercel deployment
const DEFAULT_BACKEND = "https://tetherdesk-five.vercel.app";

interface AgentConfig {
  backendOrigin?: string;
  agentSecret?: string;
}

async function readConfig(): Promise<AgentConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    if (raw.length > 10_000) {
      console.error(`Config file too large (${raw.length} bytes), ignoring`);
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
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
    return {};
  }
}

async function writeConfig(config: AgentConfig): Promise<void> {
  await mkdir(AGENT_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

function generateAgentSecret(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Find the agent entry point bundled inside the tetherdesk package.
 * During build, apps/agent/dist/main.js is copied to dist/agent/main.js.
 * Falls back to the workspace path for local dev.
 */
function findAgentScript(): string {
  const _require = createRequire(import.meta.url);
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // 1. Bundled alongside CLI (production: dist/agent/main.js)
  const bundledPath = join(__dirname, "agent", "main.js");

  // 2. Workspace sibling (dev: apps/agent/dist/main.js)
  const workspacePath = join(__dirname, "..", "..", "..", "apps", "agent", "dist", "main.js");

  // Try resolving @tetherdesk/agent if installed as a dep
  try {
    return _require.resolve("@tetherdesk/agent");
  } catch {
    // not installed as a peer dep
  }

  // Use bundled or workspace path (existsSync not needed — node will error clearly)
  try {
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    if (existsSync(bundledPath)) return bundledPath;
    if (existsSync(workspacePath)) return workspacePath;
  } catch {
    // ignore
  }

  return bundledPath; // let node throw a clear "module not found" if missing
}

function killProc(proc: ChildProcess): void {
  try {
    if (process.platform === "win32" && proc.pid) {
      spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      proc.kill("SIGTERM");
    }
  } catch {
    // already dead
  }
}

export interface StartOptions {
  /** Fixed backend URL — skip config lookup and use this domain */
  domain?: string;
}

export async function runStart(options: StartOptions = {}): Promise<void> {
  const procs: ChildProcess[] = [];
  await mkdir(AGENT_DIR, { recursive: true });

  const cleanup = () => {
    console.log(pc.yellow("\n\nShutting down TetherDesk…"));
    procs.forEach(killProc);
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // ── Resolve backend URL ────────────────────────────────────────────────────
  const existingConfig = await readConfig();

  let backendUrl: string;
  if (options.domain) {
    backendUrl = options.domain;
    console.log(pc.dim(`  Using provided domain: ${backendUrl}`));
  } else if (existingConfig.backendOrigin) {
    backendUrl = existingConfig.backendOrigin;
    console.log(pc.dim(`  Using saved backend: ${backendUrl}`));
  } else {
    backendUrl = DEFAULT_BACKEND;
    console.log(pc.dim(`  Using default backend: ${backendUrl}`));
  }

  // ── Persist config ─────────────────────────────────────────────────────────
  const agentSecret = existingConfig.agentSecret ?? generateAgentSecret();
  await writeConfig({ ...existingConfig, backendOrigin: backendUrl, agentSecret });
  console.log(pc.dim(`  Config saved to ${CONFIG_PATH}\n`));

  // ── Start agent ────────────────────────────────────────────────────────────
  console.log(pc.bold("[1/1] Starting TetherDesk agent…\n"));

  const agentScript = findAgentScript();

  const agentProc = spawn(process.execPath, [agentScript, "start"], {
    stdio: "inherit",
    env: {
      ...process.env,
      TETHERDESK_BACKEND_URL: backendUrl,
      AGENT_SECRET: agentSecret,
    },
  });
  procs.push(agentProc);

  agentProc.on("error", (err) => {
    console.error(pc.red(`\n  Agent failed to start: ${err.message}`));
    console.error(pc.dim(`  Agent path: ${agentScript}`));
    console.error(pc.dim(`  Run 'npx tetherdesk init' to set up TetherDesk first.`));
    process.exit(1);
  });

  agentProc.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(pc.red(`\n  Agent exited unexpectedly (code ${code}).`));
      console.error(pc.dim(`  Check logs: Get-Content ~\\.tetherdesk\\logs\\agent.log -Wait`));
      process.exit(1);
    }
  });

  // ── Print instructions ─────────────────────────────────────────────────────
  console.log(pc.bold(pc.green(" TetherDesk is running!\n")));
  console.log(pc.cyan("  Dashboard: ") + pc.bold(`${backendUrl}/dashboard`));
  console.log(pc.dim("\n  Waiting for access key…"));
  console.log(pc.dim("  Press Ctrl+C to stop.\n"));

  // ── Poll for pairing key and print it ─────────────────────────────────────
  void (async () => {
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise<void>((r) => setTimeout(r, 3_000));
      try {
        const resp = await fetch(`${backendUrl}/api/pairing/active-qr`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (!resp.ok) continue;
        const json = await resp.json() as { ok: boolean; data?: { pairingUrl: string } };
        if (!json.ok || !json.data?.pairingUrl) continue;

        const match = json.data.pairingUrl.match(/\/pair\/([A-Za-z0-9_-]+)/);
        if (!match) continue;
        const token = match[1];

        console.log(pc.bold(pc.yellow("\n  ╔══════════════════════════════════╗")));
        console.log(pc.bold(pc.yellow("  ║       YOUR ACCESS KEY            ║")));
        console.log(pc.bold(pc.yellow("  ╠══════════════════════════════════╣")));
        console.log(pc.bold(pc.green(`  ║   TD-${token.padEnd(28)}║`)));
        console.log(pc.bold(pc.yellow("  ╚══════════════════════════════════╝")));
        console.log();
        console.log(pc.cyan("  Steps:"));
        console.log(pc.white(`  1. Open dashboard: `) + pc.bold(`${backendUrl}/dashboard`));
        console.log(pc.white(`  2. Enter key above in the "Access Key" field`));
        console.log(pc.white(`  3. Click Allow on this laptop when prompted`));
        console.log(pc.white(`  4. Your phone can now control this laptop`));
        console.log();
        console.log(pc.dim(`  (Key expires in 90 seconds — a new one will appear automatically)`));
        return;
      } catch {
        // keep polling
      }
    }
    // If polling times out, show manual instructions
    console.log(pc.yellow("\n  Could not retrieve access key automatically."));
    console.log(pc.dim(`  Open the dashboard and scan the QR code manually:`));
    console.log(pc.bold(`  ${backendUrl}/dashboard`));
  })();

  // Keep process alive until Ctrl+C
  await new Promise<void>(() => {
    // intentionally never resolves — cleanup() handles exit
  });
}
