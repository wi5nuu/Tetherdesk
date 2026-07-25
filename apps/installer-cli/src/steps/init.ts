import pc from "picocolors";
import ora from "ora";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { step01PrereqCheck } from "./01-prereq-check.js";
import { step02VercelAuth } from "./02-vercel-auth.js";
import { step03ProvisionProject } from "./03-provision-project.js";
import { step04ProvisionRedis } from "./04-provision-redis.js";
import { step05SetEnv } from "./05-set-env.js";
import { step06Deploy } from "./06-deploy.js";
import { step07InstallAgentService } from "./07-install-agent-service.js";
import { step08PermissionCheck } from "./08-permission-check.js";
import { step09FirstPairing } from "./09-first-pairing.js";

export interface InitOptions {
  skipVercel?: boolean;
  backendUrl?: string;
}

export interface InitState {
  vercelToken?: string | undefined;
  projectId?: string | undefined;
  projectUrl?: string | undefined;
  backendOrigin?: string | undefined;
  jwtSigningSecret?: string | undefined;
  agentSecret?: string | undefined;
  redisUrl?: string | undefined;
  redisToken?: string | undefined;
}

// ---------------------------------------------------------------------------
// Checkpoint persistence (Section 17 — partial installer failure / resumability)
//
// After each step succeeds we write a checkpoint file recording:
//   - which steps have completed (by name, not index, so re-ordering doesn't
//     corrupt the checkpoint)
//   - the accumulated InitState so far (credentials gathered by earlier steps
//     are available when resuming from a later step)
//
// On next run, steps whose names appear in the checkpoint are skipped with a
// "already done" indicator rather than re-executed. The checkpoint is deleted
// on successful completion of all steps or when `tetherdesk destroy` runs.
// ---------------------------------------------------------------------------

interface Checkpoint {
  completedSteps: string[];
  state: InitState;
}

function checkpointPath(): string {
  return join(homedir(), ".tetherdesk", "init-checkpoint.json");
}

async function loadCheckpoint(): Promise<Checkpoint | null> {
  try {
    const raw = await readFile(checkpointPath(), "utf8");
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return null;
  }
}

async function saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
  const dir = join(homedir(), ".tetherdesk");
  await mkdir(dir, { recursive: true });
  await writeFile(checkpointPath(), JSON.stringify(checkpoint, null, 2) + "\n", "utf8");
}

export async function clearCheckpoint(): Promise<void> {
  try {
    const { rm } = await import("node:fs/promises");
    await rm(checkpointPath(), { force: true });
  } catch {
    // best-effort
  }
}

/**
 * Orchestrates the full init flow (Section 14.1).
 *
 * Each step is idempotent AND resumable — re-running init after a failure at
 * step N skips already-completed steps 1…N-1 (using the checkpoint file) and
 * re-runs only step N onward, restoring any state gathered by previous steps
 * from the checkpoint so later steps still have access to credentials etc.
 */
export async function runInit(options: InitOptions): Promise<void> {
  // Load any existing checkpoint so we can skip completed steps
  const checkpoint = await loadCheckpoint();
  const completedSteps = new Set(checkpoint?.completedSteps ?? []);

  // Start from checkpoint state if available, then apply CLI overrides
  const state: InitState = { ...(checkpoint?.state ?? {}) };

  const steps = [
    { name: "Checking prerequisites", fn: step01PrereqCheck },
    ...(options.skipVercel || options.backendUrl
      ? []
      : [
          { name: "Authenticating with Vercel", fn: step02VercelAuth },
          { name: "Provisioning Vercel project", fn: step03ProvisionProject },
          { name: "Provisioning Redis", fn: step04ProvisionRedis },
          { name: "Setting environment variables", fn: step05SetEnv },
          { name: "Deploying and health-checking", fn: step06Deploy },
        ]),
    { name: "Installing agent service", fn: step07InstallAgentService },
    { name: "Checking OS permissions", fn: step08PermissionCheck },
    { name: "Starting first pairing session", fn: step09FirstPairing },
  ];

  if (options.backendUrl) {
    state.backendOrigin = options.backendUrl;
    console.log(pc.cyan(`Using existing backend: ${options.backendUrl}\n`));
  }

  if (completedSteps.size > 0) {
    console.log(pc.cyan(`Resuming from a previous run (${completedSteps.size}/${steps.length} steps already done).\n`));
  }

  for (const [i, step] of steps.entries()) {
    const label = `[${i + 1}/${steps.length}] ${step.name}`;

    if (completedSteps.has(step.name)) {
      // Already completed in a prior run — skip but show it visually
      console.log(pc.dim(`  ✓ ${label} (skipped — already done)`));
      continue;
    }

    const spinner = ora(`${label}...`).start();
    try {
      await step.fn(state);
      spinner.succeed(pc.green(label));

      // Persist progress so a crash on the *next* step doesn't redo this one
      completedSteps.add(step.name);
      await saveCheckpoint({
        completedSteps: Array.from(completedSteps),
        state,
      });
    } catch (err) {
      spinner.fail(pc.red(`${label} failed`));
      throw err;
    }
  }

  // All steps done — remove the checkpoint so a fresh `init` starts clean
  await clearCheckpoint();

  console.log(pc.bold(pc.green("\n✓ TetherDesk is set up and running!\n")));
  console.log(pc.cyan("Scan the QR code above with your phone to pair it."));
  console.log(pc.cyan("Run 'tetherdesk status' at any time to check connection state.\n"));
}
