import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);

/**
 * Common interface for platform-specific screen capture implementations.
 * Each platform (macOS, Windows, Linux) provides its own implementation.
 */
export interface ScreenCapture {
  initialize(): Promise<void>;
  start(): Promise<ReadableStream<Uint8Array>>;
  stop(): Promise<void>;
  getResolution(): Promise<{ width: number; height: number }>;
  checkPermissions(): Promise<{ granted: boolean; instructions?: string }>;
}

export function getScreenCapture(): ScreenCapture {
  const platform = process.platform;

  switch (platform) {
    case "darwin": {
      const { MacOSScreenCapture } = _require("./macos.js") as typeof import("./macos.js");
      return new MacOSScreenCapture();
    }
    case "win32": {
      const { WindowsScreenCapture } = _require("./windows.js") as typeof import("./windows.js");
      return new WindowsScreenCapture();
    }
    case "linux": {
      const { LinuxScreenCapture } = _require("./linux.js") as typeof import("./linux.js");
      return new LinuxScreenCapture();
    }
    default:
      throw new Error(
        `Unsupported platform: ${platform}. TetherDesk supports macOS, Windows, and Linux.`,
      );
  }
}
