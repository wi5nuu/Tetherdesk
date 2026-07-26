import { execSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { InitState } from "./init.js";

const SERVICE_LABEL = "com.tetherdesk.agent";
const AGENT_DIR = join(homedir(), ".tetherdesk");
const LOGS_DIR = join(AGENT_DIR, "logs");

/**
 * Escape a string for safe embedding inside an XML/plist <string> element.
 * Replaces the five XML special characters with their entity references.
 * BUG-FF: without escaping, a backendOrigin or path containing & < > " '
 * would produce malformed plist XML that launchctl refuses to load or,
 * worse, could be exploited to inject extra plist keys.
 */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Escape a string for safe embedding inside a Windows batch file.
 * Batch script special characters: % ^ & | < > " 
 * BUG-SEC-5: without escaping, a backendUrl containing & or | could execute
 * arbitrary commands when the batch script runs.
 */
function batchEscape(value: string): string {
  return value
    .replace(/%/g, "%%")  // % must be doubled in batch
    .replace(/\^/g, "^^")
    .replace(/&/g, "^&")
    .replace(/\|/g, "^|")
    .replace(/</g, "^<")
    .replace(/>/g, "^>")
    .replace(/"/g, '""'); // " is doubled in batch when inside quotes
}

/**
 * Step 7: Install and start the laptop agent as an OS background service.
 */
export async function step07InstallAgentService(state: InitState): Promise<void> {
  await mkdir(LOGS_DIR, { recursive: true });

  let validOrigin = "";
  if (state.backendOrigin) {
    try {
      validOrigin = new URL(state.backendOrigin).origin;
    } catch {
      throw new Error(`Invalid backendOrigin URL format: ${state.backendOrigin}`);
    }
  }

  // Persist the backend origin and agent secret for the agent to use
  const configPath = join(AGENT_DIR, "config.json");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        backendOrigin: validOrigin,
        ...(state.agentSecret ? { agentSecret: state.agentSecret } : {}),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );

  switch (process.platform) {
    case "darwin":
      await installMacosService(state);
      break;
    case "win32":
      await installWindowsService(state);
      break;
    case "linux":
      await installLinuxService(state);
      break;
    default:
      throw new Error(`Unsupported platform for service installation: ${process.platform}`);
  }
}

async function installMacosService(state: InitState): Promise<void> {
  const agentBin = process.execPath; // path to node binary running this installer
  // BUG-FF: mkdir LaunchAgents directory — it may not exist on a fresh macOS install
  // (e.g. a new user account that has never had any LaunchAgents before).
  const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
  await mkdir(launchAgentsDir, { recursive: true });
  const plistPath = join(launchAgentsDir, `${SERVICE_LABEL}.plist`);

  // BUG-FF: XML-escape all user-controlled values interpolated into the plist to prevent
  // malformed XML or plist-key injection if agentBin / backendOrigin / LOGS_DIR contain
  // &, <, >, ", or ' characters (e.g. a home directory named "O'Brien" or a URL with &).
  const backendOrigin = xmlEscape(state.backendOrigin ?? "");
  const escapedAgentBin = xmlEscape(agentBin);
  const escapedLogsDir = xmlEscape(LOGS_DIR);

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapedAgentBin}</string>
    <string>tetherdesk-agent</string>
    <string>start</string>
    <string>--backend</string>
    <string>${backendOrigin}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapedLogsDir}/agent.log</string>
  <key>StandardErrorPath</key>
  <string>${escapedLogsDir}/agent-error.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TETHERDESK_BACKEND_URL</key>
    <string>${backendOrigin}</string>
  </dict>
</dict>
</plist>`;

  await writeFile(plistPath, plistContent);

  try {
    execSync(`launchctl unload "${plistPath}"`, { stdio: "ignore" });
  } catch {
    // Ignore if not already loaded
  }
  execSync(`launchctl load "${plistPath}"`, { stdio: "pipe" });
}

async function installLinuxService(state: InitState): Promise<void> {
  const systemdDir = join(homedir(), ".config", "systemd", "user");
  await mkdir(systemdDir, { recursive: true });

  const agentBin = process.execPath;
  const unitPath = join(systemdDir, "tetherdesk-agent.service");
  const unitContent = `[Unit]
Description=TetherDesk Agent
After=network.target

[Service]
Type=simple
ExecStart=${agentBin} tetherdesk-agent start --backend ${state.backendOrigin ?? ""}
Restart=always
RestartSec=5
Environment=TETHERDESK_BACKEND_URL=${state.backendOrigin ?? ""}
StandardOutput=append:${LOGS_DIR}/agent.log
StandardError=append:${LOGS_DIR}/agent-error.log

[Install]
WantedBy=default.target
`;

  await writeFile(unitPath, unitContent);
  execSync("systemctl --user daemon-reload", { stdio: "pipe" });
  execSync("systemctl --user enable tetherdesk-agent", { stdio: "pipe" });
  execSync("systemctl --user start tetherdesk-agent", { stdio: "pipe" });
}

async function installWindowsService(state: InitState): Promise<void> {
  // Use Windows Task Scheduler (schtasks.exe) to register the agent as a
  // persistent background task that survives reboots and is visible in
  // Task Scheduler / Task Manager under "TetherDesk Agent".
  // This is preferable to a detached spawn (which dies with the terminal)
  // and avoids requiring node-windows or elevation for SC.EXE.
  const agentBin = process.execPath;
  const backendUrl = state.backendOrigin ?? "";
  const logFile = join(LOGS_DIR, "agent.log");

  // Write a small wrapper batch file that redirects stdout/stderr to the log
  // BUG-SEC-5: Escape backendUrl to prevent command injection via & | < > etc.
  const batchPath = join(AGENT_DIR, "start-agent.cmd");
  const batchContent = `@echo off\n"${agentBin}" tetherdesk-agent start --backend "${batchEscape(backendUrl)}" >> "${logFile}" 2>&1\n`;
  await writeFile(batchPath, batchContent);

  const taskName = "TetherDeskAgent";

  // Delete any existing task with this name (idempotent re-run)
  try {
    execSync(`schtasks /Delete /TN "${taskName}" /F`, { stdio: "ignore" });
  } catch {
    // Task didn't exist — ignore
  }

  // Register: run at logon for the current user, no password required
  execSync(
    `schtasks /Create /TN "${taskName}" /TR "${batchPath}" /SC ONLOGON /RL HIGHEST /F`,
    { stdio: "pipe" },
  );

  // Start it immediately without waiting for next logon
  try {
    execSync(`schtasks /Run /TN "${taskName}"`, { stdio: "pipe" });
  } catch {
    // Non-fatal — task is registered and will start on next logon
    console.warn("  Note: agent task registered but could not be started immediately. It will start on next login.");
  }
}
