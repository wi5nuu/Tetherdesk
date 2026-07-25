/**
 * Standalone proof (Phase 0 exit criteria, Section 22): the ECDH handshake produces matching
 * shared keys between two INDEPENDENT OS PROCESSES that never share memory. This script plays
 * the untrusted backend relay — it shuttles only base64url-encoded public keys between the two
 * child processes and never sees a secret key or the derived session key's origin, mirroring
 * exactly what a real Vercel signaling relay is allowed to see (Section 7.2, 10.2).
 *
 * Run with: pnpm --filter @tetherdesk/crypto prove:handshake
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomBytes } from "@noble/hashes/utils.js";
import { toBase64Url } from "../src/encoding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const partyScript = path.join(__dirname, "handshake-party.ts");
const tsxCliPath = fileURLToPath(import.meta.resolve("tsx/cli"));

interface Party {
  name: string;
  readLine: () => Promise<string>;
  writeLine: (line: string) => void;
  waitForExit: () => Promise<number>;
}

function spawnParty(role: string, sessionSalt: string): Party {
  const child = spawn(process.execPath, [tsxCliPath, partyScript, role, sessionSalt], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const rl = createInterface({ input: child.stdout });
  const lines: string[] = [];
  const waiters: ((line: string) => void)[] = [];
  rl.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) {
      waiter(line);
    } else {
      lines.push(line);
    }
  });

  return {
    name: role,
    readLine: () =>
      new Promise<string>((resolve) => {
        const buffered = lines.shift();
        if (buffered !== undefined) {
          resolve(buffered);
        } else {
          waiters.push(resolve);
        }
      }),
    writeLine: (line: string) => {
      child.stdin.write(`${line}\n`);
    },
    waitForExit: () =>
      new Promise<number>((resolve) => {
        child.on("exit", (code) => resolve(code ?? 1));
      }),
  };
}

async function main(): Promise<void> {
  const sessionSalt = toBase64Url(randomBytes(16));
  console.log(`[relay] starting pairing session, salt=${sessionSalt}`);

  const laptop = spawnParty("laptop", sessionSalt);
  const phone = spawnParty("phone", sessionSalt);

  const laptopPublicKey = await laptop.readLine();
  const phonePublicKey = await phone.readLine();
  console.log(`[relay] relayed laptop pubkey -> phone: ${laptopPublicKey}`);
  console.log(`[relay] relayed phone pubkey -> laptop: ${phonePublicKey}`);

  // The relay only ever forwards public keys — this is the entire "signaling" step.
  laptop.writeLine(phonePublicKey);
  phone.writeLine(laptopPublicKey);

  const laptopSessionKey = await laptop.readLine();
  const phoneSessionKey = await phone.readLine();

  const [laptopExit, phoneExit] = await Promise.all([laptop.waitForExit(), phone.waitForExit()]);

  if (laptopExit !== 0 || phoneExit !== 0) {
    throw new Error(`child process failed (laptop exit=${laptopExit}, phone exit=${phoneExit})`);
  }

  if (laptopSessionKey !== phoneSessionKey) {
    console.error("FAIL: session keys diverged between independent processes");
    console.error({ laptopSessionKey, phoneSessionKey });
    process.exitCode = 1;
    return;
  }

  console.log(`PASS: shared secret matches across two independent processes`);
  console.log(`      session key = ${laptopSessionKey}`);
}

main().catch((error: unknown) => {
  console.error("fatal:", error);
  process.exitCode = 1;
});
