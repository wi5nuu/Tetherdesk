import type { InitState } from "./init.js";

const VERCEL_API = "https://api.vercel.com";

/**
 * Step 3: Create a new Vercel project (or find an existing one with the same name)
 * and trigger a Git-less deployment from the local build output tarball.
 */
export async function step03ProvisionProject(state: InitState): Promise<void> {
  if (!state.vercelToken) throw new Error("Vercel token is required");

  // Derive a deterministic project name from the hostname so re-runs find the same project
  const { hostname } = await import("node:os");
  const projectName = `tetherdesk-${hostname().toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

  // Check if project already exists
  const listResp = await vercelFetch(state.vercelToken, `/v9/projects/${projectName}`);
  if (listResp.ok) {
    const existing = (await listResp.json()) as { id: string; url?: string };
    state.projectId = existing.id;
    state.projectUrl = `https://${projectName}.vercel.app`;
    return;
  }

  // Create new project
  const createResp = await vercelFetch(state.vercelToken, "/v10/projects", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      framework: "nextjs",
      serverlessFunctionRegion: "iad1",
    }),
  });

  if (!createResp.ok) {
    const err = await createResp.text();
    throw new Error(`Failed to create Vercel project: ${err}`);
  }

  const project = (await createResp.json()) as { id: string };
  state.projectId = project.id;
  state.projectUrl = `https://${projectName}.vercel.app`;
}

export async function vercelFetch(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  try {
    // Add 30s timeout to all Vercel API calls to prevent hanging on network issues
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    
    const response = await fetch(`${VERCEL_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      signal: options.signal ?? controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    // Provide user-friendly error messages for common network issues
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        throw new Error(
          `Request to Vercel API timed out after 30 seconds.\n` +
          `Check your internet connection and try again.`
        );
      }
      if (err.message.includes("fetch failed") || err.message.includes("ENOTFOUND")) {
        throw new Error(
          `Could not reach Vercel API (${VERCEL_API}).\n` +
          `Check your internet connection and try again.\n` +
          `Original error: ${err.message}`
        );
      }
    }
    // Re-throw other errors as-is
    throw err;
  }
}
