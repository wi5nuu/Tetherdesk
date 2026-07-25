/**
 * Typed SDK wrapper around the Vercel REST API (Section 5, infra-as-code).
 *
 * This module replaces raw `vercel` CLI shell-outs so each step in the
 * installer is individually testable and produces typed errors rather than
 * requiring stdout parsing.
 *
 * All functions accept a `token` parameter (the user's Vercel personal
 * access token obtained via the device-authorization flow in step 02).
 *
 * Reference: https://vercel.com/docs/rest-api
 */

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
  link?: { repoId?: string; type?: string };
  latestDeployments?: VercelDeployment[];
}

export interface VercelDeployment {
  id: string;
  url: string;
  state: "BUILDING" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY" | "CANCELED";
  readyState: string;
  createdAt: number;
}

export interface VercelEnvVar {
  key: string;
  value: string;
  type: "plain" | "secret" | "encrypted";
  target: Array<"production" | "preview" | "development">;
}

export interface VercelTeamRef {
  teamId?: string;
}

const BASE = "https://api.vercel.com";

async function vFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
  teamRef?: VercelTeamRef
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (teamRef?.teamId) url.searchParams.set("teamId", teamRef.teamId);

  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body?.error?.message ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`Vercel API ${res.status} on ${path}: ${detail}`);
  }

  return res.json() as Promise<T>;
}

// -------------------------------------------------------------------------
// Projects
// -------------------------------------------------------------------------

export async function createProject(
  token: string,
  name: string,
  framework: "nextjs",
  teamRef?: VercelTeamRef
): Promise<VercelProject> {
  return vFetch<VercelProject>(
    token,
    "/v9/projects",
    {
      method: "POST",
      body: JSON.stringify({ name, framework }),
    },
    teamRef
  );
}

export async function getProject(
  token: string,
  idOrName: string,
  teamRef?: VercelTeamRef
): Promise<VercelProject> {
  return vFetch<VercelProject>(token, `/v9/projects/${encodeURIComponent(idOrName)}`, {}, teamRef);
}

export async function deleteProject(
  token: string,
  id: string,
  teamRef?: VercelTeamRef
): Promise<void> {
  await vFetch<unknown>(
    token,
    `/v9/projects/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    teamRef
  );
}

// -------------------------------------------------------------------------
// Deployments
// -------------------------------------------------------------------------

/**
 * Create a deployment from a local directory tarball.
 * Vercel's deployment API accepts a list of files uploaded via the Files API.
 * This function wraps the two-step process: upload files → create deployment.
 *
 * Phase 4: implement full tarball upload. For now, triggers a Git-linked
 * deployment if the project is linked to a repository.
 */
export async function triggerDeployment(
  token: string,
  projectId: string,
  _buildOutput: { files: Array<{ name: string; data: string }> },
  teamRef?: VercelTeamRef
): Promise<VercelDeployment> {
  return vFetch<VercelDeployment>(
    token,
    "/v13/deployments",
    {
      method: "POST",
      body: JSON.stringify({
        name: projectId,
        project: projectId,
        target: "production",
        // Phase 4: include files array from tarball
      }),
    },
    teamRef
  );
}

export async function getDeployment(
  token: string,
  deploymentId: string,
  teamRef?: VercelTeamRef
): Promise<VercelDeployment> {
  return vFetch<VercelDeployment>(
    token,
    `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    {},
    teamRef
  );
}

/**
 * Poll until the deployment reaches READY or ERROR, with a timeout.
 */
export async function waitForDeployment(
  token: string,
  deploymentId: string,
  teamRef?: VercelTeamRef,
  timeoutMs = 300_000
): Promise<VercelDeployment> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const d = await getDeployment(token, deploymentId, teamRef);
    if (d.state === "READY") return d;
    if (d.state === "ERROR" || d.state === "CANCELED") {
      throw new Error(`Deployment ${deploymentId} ended with state: ${d.state}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Deployment ${deploymentId} did not become READY within ${timeoutMs / 1000}s`);
}

// -------------------------------------------------------------------------
// Environment variables
// -------------------------------------------------------------------------

export async function setEnvVars(
  token: string,
  projectId: string,
  vars: VercelEnvVar[],
  teamRef?: VercelTeamRef
): Promise<void> {
  // Vercel allows bulk upsert via POST /v10/projects/{id}/env
  await vFetch<unknown>(
    token,
    `/v10/projects/${encodeURIComponent(projectId)}/env`,
    {
      method: "POST",
      body: JSON.stringify(vars),
    },
    teamRef
  );
}

export async function deleteEnvVar(
  token: string,
  projectId: string,
  envId: string,
  teamRef?: VercelTeamRef
): Promise<void> {
  await vFetch<unknown>(
    token,
    `/v10/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(envId)}`,
    { method: "DELETE" },
    teamRef
  );
}

// -------------------------------------------------------------------------
// Integrations / Marketplace
// -------------------------------------------------------------------------

export interface MarketplaceIntegration {
  id: string;
  slug: string;
  configuration?: { envVarPrefix?: string };
}

export async function listIntegrations(
  token: string,
  teamRef?: VercelTeamRef
): Promise<MarketplaceIntegration[]> {
  const res = await vFetch<{ installations: MarketplaceIntegration[] }>(
    token,
    "/v1/integrations/configurations",
    {},
    teamRef
  );
  return res.installations;
}

// -------------------------------------------------------------------------
// User / auth validation
// -------------------------------------------------------------------------

export interface VercelUser {
  uid: string;
  email: string;
  username: string;
}

export async function getAuthenticatedUser(token: string): Promise<VercelUser> {
  const res = await vFetch<{ user: VercelUser }>(token, "/v2/user");
  return res.user;
}
