/**
 * Linux screen capture implementation using screenshot-desktop + jpeg-js.
 *
 * screenshot-desktop on Linux invokes `import` (ImageMagick), `scrot`, or
 * `gnome-screenshot` depending on what is available on PATH. It works on
 * both X11 and some Wayland environments (when XWayland is running or a
 * compatible backend is available).
 *
 * jpeg-js decodes the JPEG to raw RGBA for RTCVideoSource.onFrame().
 *
 * Long-term: PipeWire via xdg-desktop-portal (Wayland) or XShm (X11) via
 * native modules would give hardware-accelerated capture without spawning a
 * subprocess per frame. This screenshot-desktop path is a pure-JS baseline
 * that works without any native addon.
 *
 * Wayland note: this will work if XWayland is running (most GNOME/KDE
 * sessions). On pure Wayland without XWayland it will fail with a clear
 * error from screenshot-desktop — the user will need to enable XWayland or
 * wait for the Phase 3 PipeWire native addon.
 */

import type { ScreenCapture } from "./index.js";

type ScreenshotDesktop = (opts?: { format?: string }) => Promise<Buffer>;
type JpegJs = {
  decode(buf: Buffer | Uint8Array, opts?: { useTArray?: boolean }): {
    width: number;
    height: number;
    data: Uint8Array;
  };
};

function loadDeps(): { screenshot: ScreenshotDesktop; jpegJs: JpegJs } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const screenshot = require("screenshot-desktop") as ScreenshotDesktop;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jpegJs = require("jpeg-js") as JpegJs;
  return { screenshot, jpegJs };
}

function detectDisplayServer(): "wayland" | "x11" | "unknown" {
  if (process.env["WAYLAND_DISPLAY"]) return "wayland";
  if (process.env["DISPLAY"]) return "x11";
  return "unknown";
}

export class LinuxScreenCapture implements ScreenCapture {
  private initialized = false;
  private running = false;
  private cachedResolution: { width: number; height: number } | null = null;
  private readonly targetFps: number;
  private readonly displayServer: "wayland" | "x11" | "unknown";

  constructor(targetFps = 15) {
    this.targetFps = targetFps;
    this.displayServer = detectDisplayServer();
  }

  async initialize(): Promise<void> {
    if (this.displayServer === "unknown") {
      throw new Error(
        "Neither WAYLAND_DISPLAY nor DISPLAY is set. " +
          "TetherDesk Agent must be run inside a graphical desktop session."
      );
    }
    const { screenshot, jpegJs } = loadDeps();
    const buf = await screenshot({ format: "jpg" });
    const frame = jpegJs.decode(buf, { useTArray: true });
    this.cachedResolution = { width: frame.width, height: frame.height };
    this.initialized = true;
  }

  async start(): Promise<ReadableStream<Uint8Array>> {
    if (!this.initialized) throw new Error("Call initialize() first");
    this.running = true;
    const { screenshot, jpegJs } = loadDeps();
    const intervalMs = Math.round(1000 / this.targetFps);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        while (self.running) {
          const t0 = Date.now();
          try {
            const buf = await screenshot({ format: "jpg" });
            const frame = jpegJs.decode(buf, { useTArray: true });
            self.cachedResolution = { width: frame.width, height: frame.height };
            controller.enqueue(frame.data);
          } catch (err) {
            controller.error(err);
            return;
          }
          const elapsed = Date.now() - t0;
          const sleep = Math.max(0, intervalMs - elapsed);
          if (sleep > 0) await new Promise<void>((r) => setTimeout(r, sleep));
        }
        controller.close();
      },
      cancel() {
        self.running = false;
      },
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.initialized = false;
  }

  async getResolution(): Promise<{ width: number; height: number }> {
    if (this.cachedResolution) return this.cachedResolution;
    if (!this.initialized) throw new Error("Call initialize() first");
    const { screenshot, jpegJs } = loadDeps();
    const buf = await screenshot({ format: "jpg" });
    const frame = jpegJs.decode(buf, { useTArray: true });
    this.cachedResolution = { width: frame.width, height: frame.height };
    return this.cachedResolution;
  }

  async checkPermissions(): Promise<{ granted: boolean; instructions?: string }> {
    if (this.displayServer === "wayland") {
      // Attempt a probe — may work with XWayland, may not on pure Wayland.
      try {
        const { screenshot } = loadDeps();
        await screenshot({ format: "jpg" });
        return { granted: true };
      } catch {
        return {
          granted: false,
          instructions:
            "On Wayland, screen capture requires XWayland to be running, or a " +
            "PipeWire-compatible screen-share backend. Ensure XWayland is enabled " +
            "in your compositor settings. If your compositor does not support " +
            "XWayland (rare), the Phase 3 PipeWire native addon will be required.",
        };
      }
    }
    // X11: no special permissions required for the current user's own session.
    return { granted: true };
  }
}
