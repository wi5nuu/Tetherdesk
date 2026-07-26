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
 * Find the agent entry point.
 * Priority:
 * 1. TETHERDESK_AGENT_PATH env var (override for dev/testing)
 * 2. tetherdesk-agent binary in PATH (installed globally)
 * 3. Workspace sibling apps/agent/dist/main.js (dev mode)
 * 4. ~/.tetherdesk/agent/main.js (installed by `tetherdesk init`)
 */
async function findAgentScript(): Promise<{ type: "binary" | "script"; path: string } | null> {
  const _require = createRequire(import.meta.url);
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // 1. Env override
  if (process.env["TETHERDESK_AGENT_PATH"]) {
    return { type: "script", path: process.env["TETHERDESK_AGENT_PATH"] };
  }

  // 2. Installed globally as @tetherdesk/agent
  try {
    const resolved = _require.resolve("@tetherdesk/agent/dist/main.js");
    return { type: "script", path: resolved };
  } catch { /* not installed */ }

  // 3. Workspace sibling (dev: running from inside the repo)
  const workspacePath = join(__dirname, "..", "..", "..", "apps", "agent", "dist", "main.js");
  try {
    await fsAccess(workspacePath);
    return { type: "script", path: workspacePath };
  } catch { /* not found */ }

  // 4. Common dev locations — D:\TetherDesk or ~/TetherDesk
  const commonDevPaths = [
    join("D:\\", "TetherDesk", "apps", "agent", "dist", "main.js"),
    join(homedir(), "TetherDesk", "apps", "agent", "dist", "main.js"),
    join(homedir(), "Documents", "TetherDesk", "apps", "agent", "dist", "main.js"),
  ];
  for (const devPath of commonDevPaths) {
    try {
      await fsAccess(devPath);
      return { type: "script", path: devPath };
    } catch { /* not found */ }
  }

  // 5. ~/.tetherdesk/agent/main.js (installed by tetherdesk init)
  const installedPath = join(homedir(), ".tetherdesk", "agent", "main.js");
  try {
    await fsAccess(installedPath);
    return { type: "script", path: installedPath };
  } catch { /* not found */ }

  return null;
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

  // ── Find and start agent ───────────────────────────────────────────────────
  console.log(pc.bold("[1/1] Starting TetherDesk agent…\n"));

  const agentLocation = await findAgentScript();

  if (!agentLocation) {
    console.error(pc.red("  Agent not found on this system.\n"));
    console.error(pc.white("  TetherDesk agent needs to be installed first."));
    console.error(pc.white("  Run the following command to set up:"));
    console.error(pc.bold(pc.cyan("\n    npx tetherdesk init\n")));
    console.error(pc.dim("  This will install the agent as a background service on your laptop."));
    process.exit(1);
  }

  const agentProc = spawn(process.execPath, [agentLocation.path, "start"], {
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
    console.error(pc.dim(`  Agent path: ${agentLocation.path}`));
    console.error(pc.dim(`  Run 'npx tetherdesk init' to reinstall the agent.`));
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
  console.log(pc.dim("  Press Ctrl+C to stop."));
  console.log(pc.dim("\n  Created by Wisnu Alfian Nur Ashar\n"));

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
        const json = await resp.json() as { ok: boolean; data?: { pairingUrl: string; pairingToken?: string } };
        if (!json.ok || !json.data?.pairingUrl) continue;

        // Prefer the short pairingToken stored directly; fall back to extracting
        // it from the pairingUrl base64url payload so older agent versions still work.
        let token: string | null = json.data.pairingToken ?? null;
        if (!token) {
          const match = json.data.pairingUrl.match(/\/pair\/([A-Za-z0-9_-]+)/);
          if (match?.[1]) {
            try {
              const decoded = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")) as { pairingToken?: string };
              token = decoded.pairingToken ?? null;
            } catch {
              // not a JSON payload — use raw segment as token
              token = match[1];
            }
          }
        }
        if (!token) continue;

        console.log(pc.dim(`  (Access key expires in 90 seconds — a new one will appear automatically)`));
        return;
      } catch {
        // keep polling
      }
    }
    // If polling times out, show manual instructions
    console.log(pc.yellow("\n  Could not retrieve access key automatically."));
    console.log(pc.dim(`  Open the dashboard and check the agent status:`));
    console.log(pc.bold(`  ${backendUrl}/dashboard`));
  })();

  // Keep process alive until Ctrl+C
  await new Promise<void>(() => {
    // intentionally never resolves — cleanup() handles exit
  });
}
