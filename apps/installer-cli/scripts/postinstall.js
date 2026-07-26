#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..", "..");

function run(cmd, args, cwd = rootDir) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: true });
    child.on("close", (code) => resolve(code === 0));
  });
}

async function main() {
  console.log("\n📦 Installing @roamhq/wrtc globally (required for screen capture)...");

  const ok = await run("npm", ["install", "-g", "@roamhq/wrtc@0.10.0"], rootDir);

  if (ok) {
    console.log("✅ @roamhq/wrtc installed globally\n");
  } else {
    console.warn(
      "⚠️  Failed to install @roamhq/wrtc globally.\n" +
      "   Screen capture may not work. You can install manually later:\n" +
      "   npm install -g @roamhq/wrtc@0.10.0\n"
    );
  }
}

main();