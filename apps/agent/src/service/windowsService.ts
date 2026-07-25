/**
 * Windows service registration for the TetherDesk Agent (Section 14.2).
 *
 * Uses the Windows Service Control Manager via `node-windows` to register
 * "TetherDesk Agent" as a Windows Service visible in Services.msc and
 * Task Manager under a clear, honest name — never disguised.
 *
 * NOTE: Installing a Windows Service requires administrator privileges.
 * The installer detects this and prompts the user to re-run elevated,
 * or falls back to a Startup folder shortcut for users who cannot/will not
 * run as admin (see installWindowsServiceOrFallback).
 *
 * Phase 2: wire in the actual node-windows dependency and replace stubs.
 */

import { execSync, spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

export interface ServiceInstallOptions {
  executablePath: string;
  backendOrigin: string;
  logDir?: string;
}

const SERVICE_NAME = "TetherDesk Agent";
const SERVICE_ID = "TetherDeskAgent";

export async function installWindowsService(opts: ServiceInstallOptions): Promise<void> {
  // Attempt to register via sc.exe (built-in Windows Service Control)
  // node-windows provides a friendlier API (Phase 2), but sc.exe is available
  // on all Windows versions without extra dependencies.
  const binPath = `"${opts.executablePath}" start --backend "${opts.backendOrigin}"`;

  try {
    // Delete any stale registration first (idempotent)
    spawnSync("sc.exe", ["delete", SERVICE_ID], { stdio: "ignore" });
  } catch {
    // Didn't exist
  }

  const result = spawnSync(
    "sc.exe",
    [
      "create",
      SERVICE_ID,
      `binPath= ${binPath}`,
      "start= auto",
      `DisplayName= ${SERVICE_NAME}`,
      "obj= LocalSystem",
    ],
    { stdio: "pipe", encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(
      `Failed to register Windows service (sc.exe exited ${result.status ?? "unknown"}). ` +
        "This typically requires administrator privileges. " +
        "Re-run the installer as an administrator, or use the Startup folder fallback."
    );
  }

  // Set description
  spawnSync(
    "sc.exe",
    [
      "description",
      SERVICE_ID,
      "TetherDesk background agent for remote laptop control. " +
        "Installed by 'npx tetherdesk init'. Remove with 'npx tetherdesk destroy'.",
    ],
    { stdio: "ignore" }
  );

  // Start the service immediately
  spawnSync("sc.exe", ["start", SERVICE_ID], { stdio: "ignore" });
}

/**
 * Fallback for non-admin users: drop a shortcut in the Windows Startup folder
 * so the agent starts on login via the shell rather than as a service.
 * Less robust (no restart-on-failure) but requires no elevation.
 */
export async function installWindowsStartupFallback(opts: ServiceInstallOptions): Promise<void> {
  const startupDir = join(
    process.env["APPDATA"] ?? homedir(),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup"
  );
  const shortcutPath = join(startupDir, "TetherDesk Agent.lnk");

  // BUG-P: Build the PowerShell script using single-quoted PS strings with proper
  // PS single-quote escaping (double the single quote), then write it to a temp
  // file and invoke with -File so no shell-expansion of the content ever occurs.
  // This eliminates the command-injection vector that existed when the script was
  // passed via -Command with execSync string interpolation.
  const escapedShortcut = shortcutPath.replace(/'/g, "''");
  const escapedExe = opts.executablePath.replace(/'/g, "''");
  const escapedBackend = opts.backendOrigin.replace(/'/g, "''");

  const ps = [
    `$ws = New-Object -ComObject WScript.Shell`,
    `$sc = $ws.CreateShortcut('${escapedShortcut}')`,
    `$sc.TargetPath = '${escapedExe}'`,
    `$sc.Arguments = 'start --backend ${escapedBackend}'`,
    `$sc.WindowStyle = 7`,
    `$sc.Description = 'TetherDesk Agent'`,
    `$sc.Save()`,
  ].join("\r\n");

  const tmpFile = join(tmpdir(), `td-shortcut-${randomBytes(4).toString("hex")}.ps1`);
  try {
    writeFileSync(tmpFile, ps, { encoding: "utf8" });
    spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", tmpFile],
      { stdio: "pipe" },
    );
  } finally {
    try { unlinkSync(tmpFile); } catch { /* best-effort cleanup */ }
  }
}

export async function uninstallWindowsService(): Promise<void> {
  spawnSync("sc.exe", ["stop", SERVICE_ID], { stdio: "ignore" });
  spawnSync("sc.exe", ["delete", SERVICE_ID], { stdio: "ignore" });
}

export async function getWindowsServiceStatus(): Promise<"running" | "stopped" | "not-installed"> {
  const result = spawnSync("sc.exe", ["query", SERVICE_ID], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0) return "not-installed";
  const out = result.stdout ?? "";
  if (out.includes("RUNNING")) return "running";
  return "stopped";
}

export function isRunningAsAdmin(): boolean {
  try {
    execSync("net session", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
