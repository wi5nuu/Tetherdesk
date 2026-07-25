import { execSync } from "node:child_process";
import { statfs } from "node:fs/promises";
import { homedir } from "node:os";
import type { InitState } from "./init.js";

const MIN_NODE_MAJOR = 20;

/**
 * Step 1: Verify Node version, OS support, and available disk space.
 */
export async function step01PrereqCheck(_state: InitState): Promise<void> {
  // Node version check
  const [major] = process.versions.node.split(".").map(Number);
  if (!major || major < MIN_NODE_MAJOR) {
    throw new Error(
      `Node.js ${MIN_NODE_MAJOR}+ is required (found ${process.versions.node}). ` +
        `Please upgrade: https://nodejs.org`,
    );
  }

  // OS support check
  const platform = process.platform;
  const supported = ["darwin", "win32", "linux"];
  if (!supported.includes(platform)) {
    throw new Error(
      `Unsupported platform: ${platform}. TetherDesk supports macOS, Windows, and Linux.`,
    );
  }

  // pnpm / npm availability (we need a package manager to install the agent)
  try {
    execSync("npm --version", { stdio: "ignore" });
  } catch {
    throw new Error("npm is required but not found in PATH. Please install Node.js from https://nodejs.org");
  }

  // Disk space check — require at least 100MB free on the home drive.
  // Node 21.6+ / Node 20.12+ exposes statfs(); older versions skip gracefully.
  const MIN_FREE_BYTES = 100 * 1024 * 1024; // 100 MB
  try {
    // statfs() is available in Node >=18.15 on all platforms.
    const stats = await statfs(homedir());
    const freeMB = Math.floor((stats.bfree * stats.bsize) / (1024 * 1024));
    if (stats.bfree * stats.bsize < MIN_FREE_BYTES) {
      throw new Error(
        `Not enough disk space — TetherDesk needs at least 100 MB free ` +
          `(found ${freeMB} MB on the home drive).`,
      );
    }
  } catch (err) {
    // statfs not available on this platform/version — skip check silently.
    if (err instanceof Error && err.message.includes("MB on the home drive")) throw err;
    // Otherwise ignore — not a fatal error.
  }
}
