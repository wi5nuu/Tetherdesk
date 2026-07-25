import type { InitState } from "./init.js";
import { vercelFetch } from "./03-provision-project.js";
import pc from "picocolors";

const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes — Vercel builds can take a few minutes

/**
 * Step 6: Trigger a production deployment via the Vercel REST API and poll
 * /api/health until the deployment is healthy.
 *
 * Strategy (Section 16.2):
 *   1. If the project already has a healthy deployment at state.projectUrl, skip.
 *   2. Otherwise, use the Vercel Deployments API to trigger a new deployment from
 *      the project's linked Git repository (the preferred path — requires that
 *      step 3 connected the project to a Git repo).
 *   3. If no Git integration is set up (e.g., the user is running without a repo),
 *      fall back to triggering a redeploy of the most recent existing deployment.
 *   4. If no previous deployment exists at all, print instructions for the user to
 *      push to their linked Git repo and wait for the automatic deployment, rather
 *      than deploying a placeholder HTML stub that would break the backend.
 *   5. Poll /api/health until green or deadline exceeded.
 */
export async function step06Deploy(state: InitState): Promise<void> {
  if (!state.vercelToken || !state.projectId) {
    throw new Error("Vercel token and project ID are required");
  }

  // 1. Check if already healthy
  if (state.projectUrl) {
    const healthy = await checkHealth(state.projectUrl);
    if (healthy) {
      state.backendOrigin = state.projectUrl;
      return;
    }
  }

  // 2. Attempt to trigger a deployment via Git integration (preferred path)
  //    POST /v13/deployments with gitSource triggers a build from the linked repo.
  let deployUrl: string | undefined;

  const gitDeployResp = await vercelFetch(state.vercelToken, "/v13/deployments", {
    method: "POST",
    body: JSON.stringify({
      name: state.projectId,
      projectId: state.projectId,
      target: "production",
      // Ask Vercel to redeploy from the project's linked Git ref.
      // If no Git integration exists this will fail with 400 and we fall back below.
      gitSource: { type: "github", ref: "main" },
    }),
  });

  if (gitDeployResp.ok) {
    const deployment = (await gitDeployResp.json()) as { url?: string };
    deployUrl = deployment.url ? `https://${deployment.url}` : state.projectUrl;
  } else {
    // 3. No Git integration — try triggering a redeploy of the latest deployment
    const latestResp = await vercelFetch(
      state.vercelToken,
      `/v6/deployments?projectId=${encodeURIComponent(state.projectId)}&limit=1&target=production`,
    );

    if (latestResp.ok) {
      const list = (await latestResp.json()) as { deployments?: Array<{ uid: string; url: string }> };
      const latest = list.deployments?.[0];

      if (latest) {
        // Redeploy the latest deployment
        const redeployResp = await vercelFetch(
          state.vercelToken,
          `/v13/deployments`,
          {
            method: "POST",
            body: JSON.stringify({
              deploymentId: latest.uid,
              name: state.projectId,
              projectId: state.projectId,
              target: "production",
            }),
          },
        );
        if (redeployResp.ok) {
          const redeployment = (await redeployResp.json()) as { url?: string };
          deployUrl = redeployment.url ? `https://${redeployment.url}` : state.projectUrl;
        }
      }
    }

    // 4. No deployments exist at all — the user must push to Git to trigger the
    //    first build. We cannot deploy a stub here because the backend API routes
    //    are part of the Next.js app — a stub would have no /api/health endpoint
    //    and subsequent steps would all fail.
    if (!deployUrl) {
      console.log("\n" + pc.yellow("  ┌─────────────────────────────────────────────────────────┐"));
      console.log(pc.yellow("  │  Manual step required: trigger your first deployment       │"));
      console.log(pc.yellow("  │                                                             │"));
      console.log(pc.yellow("  │  Push the 'apps/web' directory to your linked GitHub repo  │"));
      console.log(pc.yellow("  │  (or connect a repo in the Vercel dashboard), then re-run  │"));
      console.log(pc.yellow("  │  'tetherdesk init' — it will resume from this step.        │"));
      console.log(pc.yellow("  └─────────────────────────────────────────────────────────┘\n"));
      if (state.projectUrl) {
        console.log(pc.cyan(`  Vercel project: ${state.projectUrl.replace("https://", "https://vercel.com/dashboard/")}\n`));
      }
      throw new Error(
        "No deployment found. Push to your linked Git repository to trigger the first build, " +
          "then re-run 'tetherdesk init' to resume.",
      );
    }
  }

  if (deployUrl) state.backendOrigin = deployUrl;

  // 5. Poll /api/health until the deployment is ready
  const deadline = Date.now() + MAX_WAIT_MS;
  let lastError = "";

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    if (deployUrl && (await checkHealth(deployUrl))) {
      state.backendOrigin = deployUrl;
      return;
    }
    // Check deployment status to give the user a progress indicator
    const status = await getDeploymentState(state.vercelToken, state.projectId);
    if (status === "ERROR" || status === "CANCELED") {
      lastError = status;
      break;
    }
  }

  const tip = lastError
    ? `Deployment status: ${lastError}. Check the Vercel dashboard for build logs.`
    : `Backend did not become healthy within ${MAX_WAIT_MS / 60_000} minutes.` +
      ` Check the Vercel dashboard for deployment errors.`;

  throw new Error(tip);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function checkHealth(origin: string): Promise<boolean> {
  try {
    const resp = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

/** Returns the current state of the most recent production deployment, or null. */
async function getDeploymentState(
  token: string,
  projectId: string,
): Promise<string | null> {
  try {
    const resp = await vercelFetch(
      token,
      `/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=1&target=production`,
    );
    if (!resp.ok) return null;
    const list = (await resp.json()) as {
      deployments?: Array<{ readyState: string }>;
    };
    return list.deployments?.[0]?.readyState ?? null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
