import { toBase64Url } from "@tetherdesk/crypto";
import type { InitState } from "./init.js";
import { vercelFetch } from "./03-provision-project.js";

/**
 * Step 5: Generate secrets and push all required environment variables to the Vercel project.
 * Also writes secrets to the local config for the agent to use.
 */
export async function step05SetEnv(state: InitState): Promise<void> {
  if (!state.vercelToken || !state.projectId) {
    throw new Error("Vercel token and project ID are required");
  }

  // Generate secrets
  const jwtSecret = toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
  state.jwtSigningSecret = jwtSecret;

  const agentSecret = toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
  state.agentSecret = agentSecret;

  const envVars = [
    { key: "JWT_SIGNING_SECRET", value: jwtSecret, type: "secret" as const, target: ["production", "preview"] },
    { key: "AGENT_SECRET", value: agentSecret, type: "secret" as const, target: ["production", "preview"] },
    {
      key: "TETHERDESK_KEY_NAMESPACE",
      value: "td",
      type: "plain" as const,
      target: ["production"],
    },
    {
      key: "TETHERDESK_KEY_NAMESPACE",
      value: "preview",
      type: "plain" as const,
      target: ["preview"],
    },
  ];

  for (const env of envVars) {
    const resp = await vercelFetch(
      state.vercelToken,
      `/v10/projects/${state.projectId}/env`,
      {
        method: "POST",
        body: JSON.stringify(env),
      },
    );

    if (!resp.ok) {
      if (resp.status !== 409) {
        const text = await resp.text();
        throw new Error(`Failed to set ${env.key}: ${text}`);
      }
    }
  }

  // Also persist agent secret to local config so the agent can use it
  // NOTE: step07 will overwrite config.json during service installation,
  // but reads agentSecret from InitState to preserve it. Keep state.agentSecret
  // in sync with the generated value above.
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");
  const { mkdir, writeFile, readFile } = await import("node:fs/promises");
  const configPath = join(homedir(), ".tetherdesk", "config.json");
  await mkdir(join(homedir(), ".tetherdesk"), { recursive: true });
  let config: Record<string, unknown> = {};
  try {
    const raw = await readFile(configPath, "utf8");
    if (raw.length > 10_000) {
      console.error(`Config file too large (${raw.length} bytes), starting fresh`);
    } else {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        config = parsed as Record<string, unknown>;
      }
    }
  } catch {
    // file doesn't exist yet — start fresh
  }
  config.agentSecret = agentSecret;
  config.backendOrigin = state.backendOrigin;
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}
