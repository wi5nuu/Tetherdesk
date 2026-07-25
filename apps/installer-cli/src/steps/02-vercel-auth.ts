import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import pc from "picocolors";
import type { InitState } from "./init.js";

const TOKEN_FILE = join(homedir(), ".tetherdesk", "vercel-token");
const VERCEL_DEVICE_AUTH_URL = "https://api.vercel.com/v1/security/otp/request-token";
const VERCEL_DEVICE_POLL_URL = "https://api.vercel.com/v1/security/otp/attempt-login";
const CLIENT_ID = "tetherdesk-cli";

/**
 * Step 2: Ensure the user is authenticated with Vercel.
 * Uses the device-authorization flow if no token is cached (Section 14.1 step 2).
 * Clearly discloses the one required browser action before opening anything.
 */
export async function step02VercelAuth(state: InitState): Promise<void> {
  // Try cached token first
  const cached = await readCachedToken();
  if (cached) {
    const valid = await validateToken(cached);
    if (valid) {
      state.vercelToken = cached;
      return;
    }
    // Cached token expired or invalid — fall through to re-auth
  }

  // Check VERCEL_TOKEN environment variable (CI / power-user shortcut)
  const envToken = process.env["VERCEL_TOKEN"];
  if (envToken) {
    const valid = await validateToken(envToken);
    if (valid) {
      state.vercelToken = envToken;
      return;
    }
    throw new Error(
      "VERCEL_TOKEN environment variable is set but the token is invalid or expired. " +
        "Please refresh it or unset the variable to use the interactive auth flow.",
    );
  }

  // Device-authorization flow — the one disclosed manual step
  console.log(
    pc.bold(
      "\n  Opening your browser to authorize Vercel — this is the only manual step in setup.\n",
    ),
  );

  let otp: string;
  let verificationUrl: string;
  try {
    const resp = await fetch(VERCEL_DEVICE_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID }),
    });
    if (!resp.ok) throw new Error(`Vercel auth request failed: ${resp.statusText}`);
    const data = (await resp.json()) as { securityCode?: string; verificationUrl?: string };
    otp = data.securityCode ?? "";
    verificationUrl = data.verificationUrl ?? "https://vercel.com/login";
  } catch (err) {
    throw new Error(
      `Could not reach Vercel's authentication service. Check your internet connection.\n${String(err)}`,
    );
  }

  console.log(pc.cyan(`  Your one-time code: ${pc.bold(otp)}`));
  console.log(pc.cyan(`  Verify at: ${verificationUrl}\n`));

  // Open browser
  await openUrl(verificationUrl);

  // Poll for token
  const token = await pollForToken(otp);
  state.vercelToken = token;

  // Cache token for future runs
  await cacheToken(token);
}

async function readCachedToken(): Promise<string | null> {
  try {
    const content = await readFile(TOKEN_FILE, "utf8");
    return content.trim();
  } catch {
    return null;
  }
}

async function cacheToken(token: string): Promise<void> {
  const dir = join(homedir(), ".tetherdesk");
  await mkdir(dir, { recursive: true });
  await writeFile(TOKEN_FILE, token, { mode: 0o600 });
}

async function validateToken(token: string): Promise<boolean> {
  try {
    const resp = await fetch("https://api.vercel.com/v2/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function pollForToken(otp: string): Promise<string> {
  const POLL_INTERVAL = 2000;
  const MAX_WAIT = 120000;
  const deadline = Date.now() + MAX_WAIT;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL);
    try {
      const resp = await fetch(VERCEL_DEVICE_POLL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ securityCode: otp }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { token?: string };
        if (data.token) return data.token;
      }
    } catch {
      // Transient error — keep polling
    }
  }
  throw new Error("Vercel authorization timed out. Please run 'tetherdesk init' again.");
}

async function openUrl(url: string): Promise<void> {
  // Use spawn with an argument array instead of exec with shell interpolation
  // to prevent command injection if the URL ever contains shell metacharacters.
  const { spawn } = await import("node:child_process");
  const [cmd, ...args] =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
