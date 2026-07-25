/**
 * macOS launchd service registration for the TetherDesk Agent (Section 14.2).
 *
 * Creates a LaunchAgent plist in ~/Library/LaunchAgents/ named
 * com.tetherdesk.agent — clearly labeled, never disguised as a system daemon.
 * The service is user-level (LaunchAgent, not LaunchDaemon), runs only when
 * the user is logged in, and is trivially removable via launchctl or by
 * deleting the plist.
 */

import { execSync } from "node:child_process";
import { writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface ServiceInstallOptions {
  /** Absolute path to the agent binary or entry point */
  executablePath: string;
  /** Backend origin URL to pass to the agent */
  backendOrigin: string;
  /** Log directory (default: ~/.tetherdesk/logs/) */
  logDir?: string;
}

const PLIST_LABEL = "com.tetherdesk.agent";

function plistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${PLIST_LABEL}.plist`);
}

function logDir(opts: ServiceInstallOptions): string {
  return opts.logDir ?? join(homedir(), ".tetherdesk", "logs");
}

function buildPlist(opts: ServiceInstallOptions): string {
  const logs = logDir(opts);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${opts.executablePath}</string>
    <string>start</string>
    <string>--backend</string>
    <string>${opts.backendOrigin}</string>
  </array>

  <!-- Run automatically when the user logs in (Section 14.2) -->
  <key>RunAtLoad</key>
  <true/>

  <!-- Restart if the process exits unexpectedly, but NOT after an explicit
       launchctl stop — the user's explicit stop must be respected (Section 14.2) -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>StandardOutPath</key>
  <string>${logs}/agent.log</string>

  <key>StandardErrorPath</key>
  <string>${logs}/agent-error.log</string>

  <!-- Process group name visible in Activity Monitor -->
  <key>ProcessType</key>
  <string>Interactive</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>TETHERDESK_BACKEND_URL</key>
    <string>${opts.backendOrigin}</string>
  </dict>
</dict>
</plist>
`;
}

export async function installMacOSService(opts: ServiceInstallOptions): Promise<void> {
  const path = plistPath();

  // Unload any existing registration before overwriting
  try {
    execSync(`launchctl unload "${path}"`, { stdio: "ignore" });
  } catch {
    // Not currently loaded — fine
  }

  await writeFile(path, buildPlist(opts), { encoding: "utf8", mode: 0o644 });
  execSync(`launchctl load "${path}"`, { stdio: "pipe" });
}

export async function uninstallMacOSService(): Promise<void> {
  const path = plistPath();
  try {
    execSync(`launchctl unload "${path}"`, { stdio: "ignore" });
  } catch {
    // Already unloaded
  }
  await rm(path, { force: true });
}

export async function isMacOSServiceInstalled(): Promise<boolean> {
  try {
    await readFile(plistPath());
    return true;
  } catch {
    return false;
  }
}

export async function getMacOSServiceStatus(): Promise<"running" | "stopped" | "not-installed"> {
  if (!(await isMacOSServiceInstalled())) return "not-installed";
  try {
    const out = execSync(`launchctl list ${PLIST_LABEL} 2>&1`, { encoding: "utf8" });
    // launchctl list returns JSON-ish; PID > 0 means running
    return /"PID"\s*=\s*[1-9]/.test(out) ? "running" : "stopped";
  } catch {
    return "stopped";
  }
}
