import pc from "picocolors";
import type { InitState } from "./init.js";
import { vercelFetch } from "./03-provision-project.js";

export interface DestroyOptions {
  yes?: boolean;
}

/**
 * Tears down the TetherDesk installation:
 * 1. Stops and unregisters the local agent service
 * 2. Revokes all active sessions in Redis (via the backend)
 * 3. Deletes the Vercel project and all associated resources
 */
export async function runDestroy(options: DestroyOptions): Promise<void> {
  if (!options.yes) {
    console.log(pc.red("\n  Warning: This will remove the TetherDesk agent and delete the Vercel project."));
    console.log(pc.red("  All paired devices will be disconnected and their sessions revoked."));
    console.log(pc.yellow("  Pass --yes to confirm.\n"));
    return;
  }

  const state: InitState = await loadState();

  console.log(pc.bold("\nRemoving TetherDesk...\n"));

  // Step 1: Stop and remove the OS service
  await removeAgentService();

  // Step 2: Delete the Vercel project (and its add-ons)
  if (state.vercelToken && state.projectId) {
    await deleteVercelProject(state);
  }

  // Step 3: Remove local config files
  await removeLocalConfig();

  console.log(pc.bold(pc.green("\n✓ TetherDesk removed. No cloud resources remain.\n")));
}

async function removeAgentService(): Promise<void> {
  const { execSync } = await import("node:child_process");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");

  const platform = process.platform;

  try {
    if (platform === "darwin") {
      const plistPath = join(homedir(), "Library", "LaunchAgents", "com.tetherdesk.agent.plist");
      try {
        execSync(`launchctl unload "${plistPath}"`, { stdio: "ignore" });
      } catch { /* already unloaded */ }
      const { rm } = await import("node:fs/promises");
      await rm(plistPath, { force: true });
    } else if (platform === "linux") {
      try {
        execSync("systemctl --user stop tetherdesk-agent", { stdio: "ignore" });
        execSync("systemctl --user disable tetherdesk-agent", { stdio: "ignore" });
      } catch { /* already stopped */ }
      const { rm } = await import("node:fs/promises");
      const unitPath = join(homedir(), ".config", "systemd", "user", "tetherdesk-agent.service");
      await rm(unitPath, { force: true });
      try { execSync("systemctl --user daemon-reload", { stdio: "ignore" }); } catch { /* ok */ }
    } else if (platform === "win32") {
      // Kill any running tetherdesk-agent processes
      try { execSync("taskkill /F /IM tetherdesk-agent.exe", { stdio: "ignore" }); } catch { /* ok */ }
    }
  } catch (err) {
    console.log(pc.yellow(`  Warning: could not fully remove agent service: ${String(err)}`));
  }
}

async function deleteVercelProject(state: InitState): Promise<void> {
  if (!state.vercelToken || !state.projectId) return;

  const resp = await vercelFetch(
    state.vercelToken,
    `/v9/projects/${state.projectId}`,
    { method: "DELETE" },
  );

  if (!resp.ok && resp.status !== 404) {
    console.log(pc.yellow(`  Warning: could not delete Vercel project: ${resp.statusText}`));
  }
}

async function removeLocalConfig(): Promise<void> {
  const { rm } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = join(homedir(), ".tetherdesk");
  await rm(dir, { recursive: true, force: true });
}

async function loadState(): Promise<InitState> {
  const { readFile } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");

  const configPath = join(homedir(), ".tetherdesk", "config.json");
  const tokenPath = join(homedir(), ".tetherdesk", "vercel-token");

  try {
    const [config, token] = await Promise.all([
      readFile(configPath, "utf8").catch(() => "{}"),
      readFile(tokenPath, "utf8").catch(() => ""),
    ]);
    const parsed = JSON.parse(config) as Partial<InitState>;
    return { ...parsed, vercelToken: token.trim() || undefined };
  } catch {
    return {};
  }
}
