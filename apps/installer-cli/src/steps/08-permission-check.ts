import { execSync } from "node:child_process";
import pc from "picocolors";
import type { InitState } from "./init.js";

/**
 * Step 8: Check OS-level permissions for screen capture and input injection.
 * If missing, print OS-specific instructions and a deep link to the settings pane.
 */
export async function step08PermissionCheck(_state: InitState): Promise<void> {
  const platform = process.platform;

  switch (platform) {
    case "darwin":
      await checkMacosPermissions();
      break;
    case "win32":
      // Windows prompts at first-use via UAC — nothing to pre-check
      console.log(pc.dim("  Windows: input injection permissions will be requested on first use."));
      break;
    case "linux":
      await checkLinuxPermissions();
      break;
  }
}

async function checkMacosPermissions(): Promise<void> {
  // Check Screen Recording permission
  try {
    execSync(
      `osascript -e 'tell application "System Events" to get properties of front window of (first application process whose frontmost is true)'`,
      { stdio: "ignore" },
    );
  } catch {
    console.log(pc.yellow("\n  Screen Recording permission not yet granted."));
    console.log(
      pc.cyan(
        "  Please grant Screen Recording access to Terminal (or your terminal emulator) in:\n" +
          "  System Settings → Privacy & Security → Screen Recording",
      ),
    );
    console.log(
      pc.dim(
        "  Deep link: x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
      ),
    );
    console.log(pc.dim("  Press Enter after granting permission...\n"));
    await waitForEnter();
  }

  // Check Accessibility permission (for input injection)
  try {
    execSync(
      `osascript -e 'tell application "System Events" to set frontmost of (first process whose name is "Finder") to true'`,
      { stdio: "ignore" },
    );
  } catch {
    console.log(pc.yellow("\n  Accessibility permission not yet granted."));
    console.log(
      pc.cyan(
        "  Please grant Accessibility access to Terminal (or your terminal emulator) in:\n" +
          "  System Settings → Privacy & Security → Accessibility",
      ),
    );
    console.log(
      pc.dim(
        "  Deep link: x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      ),
    );
    console.log(pc.dim("  Press Enter after granting permission...\n"));
    await waitForEnter();
  }
}

async function checkLinuxPermissions(): Promise<void> {
  // Check if running on Wayland
  const isWayland = !!process.env["WAYLAND_DISPLAY"];

  if (isWayland) {
    console.log(pc.yellow("\n  Wayland detected."));
    console.log(
      pc.cyan(
        "  TetherDesk uses PipeWire for screen capture and libei/uinput for input injection on Wayland.\n" +
          "  These require portal access and may prompt for permission on first use.",
      ),
    );

    // Check uinput access
    try {
      execSync("ls /dev/uinput", { stdio: "ignore" });
    } catch {
      console.log(pc.yellow("  /dev/uinput not accessible."));
      console.log(
        pc.dim(
          "  To enable input injection, run:\n" +
            "  sudo usermod -aG input $USER\n" +
            "  Then log out and back in.",
        ),
      );
    }
  } else {
    console.log(pc.dim("  X11 detected. Screen capture and input injection use standard X11 APIs."));
  }
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
