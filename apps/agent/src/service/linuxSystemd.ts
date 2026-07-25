/**
 * Linux systemd user-unit service registration for the TetherDesk Agent (Section 14.2).
 *
 * Registers a user-level systemd unit at
 * ~/.config/systemd/user/tetherdesk-agent.service
 * with WantedBy=default.target so it starts on login and is visible via
 * `systemctl --user status tetherdesk-agent`.
 *
 * User units require systemd >= 232 (all major distros since 2017 have this).
 * Requires the user's systemd session to be active (i.e., a desktop session
 * or `loginctl enable-linger` for headless operation).
 */

import { execSync } from "node:child_process";
import { writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export interface ServiceInstallOptions {
  executablePath: string;
  backendOrigin: string;
  logDir?: string;
}

const SERVICE_NAME = "tetherdesk-agent";

function unitPath(): string {
  return join(homedir(), ".config", "systemd", "user", `${SERVICE_NAME}.service`);
}

function buildUnit(opts: ServiceInstallOptions): string {
  return `[Unit]
Description=TetherDesk Agent — remote laptop control (user session)
Documentation=https://github.com/tetherdesk/tetherdesk
After=network-online.target graphical-session.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${opts.executablePath} start --backend ${opts.backendOrigin}
Restart=on-failure
RestartSec=5s
# Cap restart attempts so a broken config doesn't spin forever
StartLimitIntervalSec=120
StartLimitBurst=5

# Log to the user's journal (journalctl --user -u tetherdesk-agent)
# and redirect stderr there too
StandardOutput=journal
StandardError=journal
SyslogIdentifier=tetherdesk-agent

Environment=TETHERDESK_BACKEND_URL=${opts.backendOrigin}

# Never run as root — always the logged-in user (enforced by user unit scope)

[Install]
WantedBy=default.target
`;
}

export async function installLinuxService(opts: ServiceInstallOptions): Promise<void> {
  const path = unitPath();
  await mkdir(dirname(path), { recursive: true });

  // Stop any running instance before overwriting the unit
  try {
    execSync(`systemctl --user stop ${SERVICE_NAME}`, { stdio: "ignore" });
  } catch {
    // Not running
  }

  await writeFile(path, buildUnit(opts), { encoding: "utf8", mode: 0o644 });
  execSync("systemctl --user daemon-reload", { stdio: "pipe" });
  execSync(`systemctl --user enable --now ${SERVICE_NAME}`, { stdio: "pipe" });
}

export async function uninstallLinuxService(): Promise<void> {
  try {
    execSync(`systemctl --user stop ${SERVICE_NAME}`, { stdio: "ignore" });
    execSync(`systemctl --user disable ${SERVICE_NAME}`, { stdio: "ignore" });
  } catch {
    // Already stopped/disabled
  }
  await rm(unitPath(), { force: true });
  try {
    execSync("systemctl --user daemon-reload", { stdio: "ignore" });
  } catch {
    // ok
  }
}

export async function isLinuxServiceInstalled(): Promise<boolean> {
  try {
    await readFile(unitPath());
    return true;
  } catch {
    return false;
  }
}

export async function getLinuxServiceStatus(): Promise<"running" | "stopped" | "not-installed"> {
  if (!(await isLinuxServiceInstalled())) return "not-installed";
  try {
    execSync(`systemctl --user is-active --quiet ${SERVICE_NAME}`, { stdio: "ignore" });
    return "running";
  } catch {
    return "stopped";
  }
}
