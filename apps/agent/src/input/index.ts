import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);

/**
 * Common interface for platform-specific input injection implementations.
 */
export interface InputInjector {
  initialize(): Promise<void>;
  injectPointer(x: number, y: number, buttons: number): Promise<void>;
  injectScroll(dx: number, dy: number): Promise<void>;
  injectKey(code: string, down: boolean): Promise<void>;
  injectTouch(points: Array<{ id: number; x: number; y: number }>): Promise<void>;
  checkPermissions(): Promise<{ granted: boolean; instructions?: string }>;
  cleanup(): Promise<void>;
}

export function getInputInjector(): InputInjector {
  const platform = process.platform;

  switch (platform) {
    case "darwin": {
      const { MacOSInputInjector } = _require("./macos.js") as typeof import("./macos.js");
      return new MacOSInputInjector();
    }
    case "win32": {
      const { WindowsInputInjector } = _require("./windows.js") as typeof import("./windows.js");
      return new WindowsInputInjector();
    }
    case "linux": {
      const { LinuxInputInjector } = _require("./linux.js") as typeof import("./linux.js");
      return new LinuxInputInjector();
    }
    default:
      throw new Error(
        `Unsupported platform: ${platform}. TetherDesk supports macOS, Windows, and Linux.`,
      );
  }
}
