import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pc from "picocolors";

const AGENT_DIR = join(homedir(), ".tetherdesk");
const CONFIG_PATH = join(AGENT_DIR, "config.json");

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

const CLOUDFLARED_CANDIDATES = [
  join(process.cwd(), "apps", "web", "cloudflared.exe"),
  join(process.cwd(), "apps", "web", "cloudflared"),
  "cloudflared",
];

function findCloudflared(): string {
  for (const candidate of CLOUDFLARED_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return "cloudflared";
}

function spawnProcess(
  cmd: string,
  args: string[],
  opts: { stdio?: "inherit" | "pipe"; cwd?: string; env?: Record<string, string> } = {},
): ChildProcess {
  return spawn(cmd, args, {
    stdio: opts.stdio ?? "inherit",
    cwd: opts.cwd ?? process.cwd(),
    shell: process.platform === "win32",
    env: opts.env ? { ...process.env, ...opts.env } : undefined,
  });
}

export function parseTunnelUrl(line: string): string | null {
  const urlMatch = line.match(/url=(https:\/\/[^\s]+\.trycloudflare\.com)/);
  if (urlMatch) return urlMatch[1] ?? null;
  const boxMatch = line.match(/(https:\/\/[^\s]+\.trycloudflare\.com)/);
  if (boxMatch) return boxMatch[1] ?? null;
  return null;
}

function startTunnel(): Promise<{ url: string; proc: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const cloudflared = findCloudflared();
    console.log(pc.dim(`  Running: ${cloudflared} tunnel --url http://localhost:3000`));

    const proc = spawn(cloudflared, ["tunnel", "--url", "http://localhost:3000"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let resolved = false;

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      process.stderr.write(pc.dim(text));
      if (!resolved) {
        for (const line of text.split("\n")) {
          const url = parseTunnelUrl(line);
          if (url) {
            resolved = true;
            resolve({ url, proc });
            return;
          }
        }
      }
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);

    proc.on("error", (err) => {
      if (!resolved) reject(new Error(`cloudflared failed to start: ${err.message}`));
    });

    proc.on("exit", (code) => {
      if (!resolved)
        reject(new Error(`cloudflared exited unexpectedly with code ${String(code)}`));
    });

    setTimeout(() => {
      if (!resolved) {
        reject(
          new Error(
            "Timed out waiting for cloudflared tunnel URL (30s).\n" +
              "Make sure cloudflared is installed or is present at apps/web/cloudflared.exe",
          ),
        );
      }
    }, 30_000);
  });
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

function generateAgentSecret(): string {
  return randomBytes(32).toString("base64url");
}

export interface StartOptions {
  /** Fixed backend URL — skip tunnel creation and use this domain instead */
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

  let tunnelUrl: string;

  // ── Step 1: Determine the backend URL ─────────────────────────────────────
  // Priority: --domain flag > existing config > new tunnel
  if (options.domain) {
    tunnelUrl = options.domain;
    console.log(pc.bold(`\nUsing fixed domain: ${tunnelUrl}\n`));
  } else {
    const existingConfig = await readConfig();
    if (existingConfig.backendOrigin) {
      tunnelUrl = existingConfig.backendOrigin;
      console.log(pc.bold(pc.cyan(`\nUsing saved domain from config: ${tunnelUrl}`)));
      console.log(pc.dim("  To start with a fresh tunnel, set --new-tunnel flag.\n"));
    } else {
      console.log(pc.bold("\n[1/3] Starting Cloudflare tunnel…"));
      let tunnelProc: ChildProcess;
      try {
        ({ url: tunnelUrl, proc: tunnelProc } = await startTunnel());
        procs.push(tunnelProc);

        // Watchdog: restart cloudflared automatically if it crashes
        tunnelProc.on("exit", (code) => {
          if (code !== 0 && code !== null) {
            console.log(pc.yellow(`\n  Tunnel exited with code ${code}, restarting…`));
            startTunnel().then((restarted) => {
              tunnelUrl = restarted.url;
              tunnelProc = restarted.proc;
              procs.push(restarted.proc);
              readConfig().then((config) =>
                writeConfig({ ...config, backendOrigin: tunnelUrl })
              ).then(() => {
                console.log(pc.green(`  Tunnel restarted: ${tunnelUrl}`));
              });
            }).catch(() => {
              console.error(pc.red("  Failed to restart tunnel. Run `tetherdesk start` again."));
            });
          }
        });
      } catch (err) {
        throw new Error(
          `Tunnel failed: ${err instanceof Error ? err.message : String(err)}\n\n` +
            `Download cloudflared from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n` +
            `and place it at apps/web/cloudflared.exe`,
        );
      }
      console.log(pc.bold(pc.green(`\n  Tunnel URL: ${tunnelUrl}`)));
    }
  }

  // ── Step 2: Write tunnel URL and agent secret to config ────────────────────
  const existingConfig = await readConfig();
  // Auto-generate AGENT_SECRET if not present
  const agentSecret = existingConfig.agentSecret ?? generateAgentSecret();
  await writeConfig({
    ...existingConfig,
    backendOrigin: tunnelUrl,
    agentSecret,
  });
  console.log(pc.dim(`  Saved to ${CONFIG_PATH}`));

  // ── Step 3: Start Next.js backend ─────────────────────────────────────────
  console.log(pc.bold("\n[2/3] Starting backend (Next.js)…"));
  console.log(pc.dim("  Waiting for http://localhost:3000 to be ready…\n"));

  const webProc = spawnProcess("pnpm", ["--filter", "@tetherdesk/web", "dev"]);
  procs.push(webProc);

  await new Promise<void>((resolve) => setTimeout(resolve, 8_000));

  // ── Step 4: Start agent ───────────────────────────────────────────────────
  console.log(pc.bold("\n[3/3] Starting agent…\n"));
  const agentProc = spawnProcess("pnpm", ["--filter", "@tetherdesk/agent", "dev"], {
    env: { AGENT_SECRET: agentSecret },
  });
  procs.push(agentProc);

  // ── Print instructions ────────────────────────────────────────────────────
  console.log(pc.bold(pc.green("\n TetherDesk is running!\n")));
  console.log(pc.cyan("  1. Open the dashboard:  ") + pc.bold(`${tunnelUrl}/dashboard`));
  console.log(pc.cyan("  2. Scan the QR code on your phone"));
  console.log(pc.cyan("  3. Tap Allow on this laptop to approve the connection"));
  console.log(pc.dim("\n  Press Ctrl+C to stop all processes.\n"));

  // ── Fetch and print one-time pairing key ──────────────────────────────────
  // Poll /api/pairing/active-qr until agent registers a QR (max 30s)
  const printPairingKey = async () => {
    const maxAttempts = 15;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise<void>((r) => setTimeout(r, 2_000));
      try {
        const resp = await fetch(`http://localhost:3000/api/pairing/active-qr`, { signal: AbortSignal.timeout(5_000) });
        if (!resp.ok) continue;
        const json = await resp.json() as { ok: boolean; data?: { pairingUrl: string } };
        if (!json.ok || !json.data?.pairingUrl) continue;
        // Extract token from URL: /pair/<token>
        const match = json.data.pairingUrl.match(/\/pair\/([A-Za-z0-9_-]+)/);
        if (!match) continue;
        const token = match[1];
        console.log(pc.bold(pc.yellow("\n  One-time access key:")));
        console.log(pc.bold(pc.green(`  TD-${token}`)));
        console.log(pc.dim("  Enter this key on your phone at: ") + pc.bold(`${tunnelUrl}/access`));
        console.log(pc.dim("  (Key expires in 90 seconds)\n"));
        return;
      } catch { /* keep polling */ }
    }
  };
  void printPairingKey();

  await new Promise<void>(() => {
    // intentionally never resolves; cleanup() handles exit
  });
}
