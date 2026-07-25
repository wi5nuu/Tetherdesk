/**
 * Local TetherDesk configuration manager.
 *
 * Persists user-editable settings to ~/.tetherdesk/config.json.
 * This is separate from the credentials written during `tetherdesk init`
 * (Vercel token, Redis URL, etc.) which live in the same directory but are
 * written by the install steps, not by this module.
 *
 * Known keys:
 *   backendOrigin   - Vercel deployment URL
 *   turnUrl         - TURN relay URL (optional, user-opted-in)
 *   turnUsername    - TURN username
 *   turnCredential  - TURN credential/password
 *   logLevel        - error | warn | info | debug
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const KNOWN_KEYS = new Set([
  "backendOrigin",
  "turnUrl",
  "turnUsername",
  "turnCredential",
  "logLevel",
]);

const LOG_LEVELS = new Set(["error", "warn", "info", "debug"]);

export type TetherDeskConfig = {
  backendOrigin?: string;
  turnUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
  logLevel?: "error" | "warn" | "info" | "debug";
};

function configPath(): string {
  return join(homedir(), ".tetherdesk", "config.json");
}

function configDir(): string {
  return join(homedir(), ".tetherdesk");
}

export async function readConfig(): Promise<TetherDeskConfig> {
  try {
    const raw = await readFile(configPath(), "utf8");
    if (raw.length > 10_000) {
      console.error(`Config file too large (${raw.length} bytes), ignoring`);
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      console.error("Config file is not a JSON object, ignoring");
      return {};
    }
    // Return parsed config with runtime validation of known fields
    const obj = parsed as Record<string, unknown>;
    return {
      ...(typeof obj.backendOrigin === "string" ? { backendOrigin: obj.backendOrigin } : {}),
      ...(typeof obj.turnUrl === "string" ? { turnUrl: obj.turnUrl } : {}),
      ...(typeof obj.turnUsername === "string" ? { turnUsername: obj.turnUsername } : {}),
      ...(typeof obj.turnCredential === "string" ? { turnCredential: obj.turnCredential } : {}),
      ...(LOG_LEVELS.has(obj.logLevel as string) ? { logLevel: obj.logLevel as "error" | "warn" | "info" | "debug" } : {}),
    };
  } catch {
    return {};
  }
}

export async function writeConfig(key: string, value: string): Promise<void> {
  if (!KNOWN_KEYS.has(key)) {
    throw new Error(
      `Unknown config key: "${key}". Run 'tetherdesk config --help' to see valid keys.`
    );
  }

  // Validate specific keys
  if (key === "logLevel" && !LOG_LEVELS.has(value)) {
    throw new Error(`Invalid logLevel "${value}". Must be one of: error, warn, info, debug`);
  }
  if (key === "backendOrigin") {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") {
        throw new Error(`backendOrigin must use HTTPS (got: ${url.protocol})`);
      }
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error(`backendOrigin must be a valid URL (got: ${value})`);
      }
      throw e;
    }
  }

  // Ensure the config directory exists
  await mkdir(configDir(), { recursive: true });

  const existing = await readConfig();
  const updated = { ...existing, [key]: value };
  await writeFile(configPath(), JSON.stringify(updated, null, 2) + "\n", "utf8");
}
