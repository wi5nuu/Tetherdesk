import pc from "picocolors";
import type { InitState } from "./init.js";
import { vercelFetch } from "./03-provision-project.js";

/**
 * Step 4: Provision Upstash Redis via the Vercel Marketplace API.
 * If API provisioning fails (account restrictions, plan limits), falls back
 * to printing a direct dashboard link and waiting for manual completion.
 */
export async function step04ProvisionRedis(state: InitState): Promise<void> {
  if (!state.vercelToken || !state.projectId) {
    throw new Error("Vercel token and project ID are required");
  }

  // Check if Redis env vars are already set (idempotent resume)
  const envResp = await vercelFetch(
    state.vercelToken,
    `/v10/projects/${state.projectId}/env`,
  );
  if (envResp.ok) {
    const envData = (await envResp.json()) as { envs?: Array<{ key: string }> };
    const keys = (envData.envs ?? []).map((e) => e.key);
    if (keys.includes("UPSTASH_REDIS_REST_URL") && keys.includes("UPSTASH_REDIS_REST_TOKEN")) {
      // Already configured — retrieve and store
      return;
    }
  }

  // Attempt Marketplace integration provisioning
  const storeResp = await vercelFetch(
    state.vercelToken,
    `/v1/integrations/marketplace/upstash-redis/add`,
    {
      method: "POST",
      body: JSON.stringify({
        projectId: state.projectId,
        plan: "free",
      }),
    },
  );

  if (storeResp.ok) {
    // Redis provisioned automatically — env vars will be injected by Vercel Marketplace
    return;
  }

  // Fallback: guide user to manual provisioning
  const dashboardUrl = `https://vercel.com/dashboard/stores?project=${state.projectId}`;
  console.log(pc.yellow("\n  Redis could not be provisioned automatically."));
  console.log(pc.cyan(`  Please add Upstash Redis here: ${dashboardUrl}`));
  console.log(pc.dim("  Select 'Upstash Redis' → 'Add to project' → choose the free tier."));
  console.log(pc.dim("  Press Enter when done...\n"));

  await waitForEnter();
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      resolve();
    });
  });
}
