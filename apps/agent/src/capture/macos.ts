/**
 * macOS screen capture implementation using screenshot-desktop + jpeg-js.
 *
 * screenshot-desktop on macOS invokes the system screencapture utility
 * (available since macOS 10.3) to produce a JPEG. jpeg-js decodes it to raw
 * RGBA, which RTCVideoSource.onFrame() expects.
 *
 * NOTE: macOS 12.3+ requires Screen Recording permission (System Settings →
 * Privacy & Security → Screen Recording) for any process that calls
 * screencapture. The OS will present this prompt automatically on the first
 * capture attempt; we do not suppress or bypass it. If the permission is
 * denied, screenshot-desktop will throw and initialize() will surface the
 * error with clear remediation instructions.
 *
 * Long-term: ScreenCaptureKit (available macOS 12.3+) via a native module
 * would enable GPU-accelerated capture and hardware encode. This
 * screenshot-desktop path is a pure-JS working baseline.
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

export class MacOSScreenCapture implements ScreenCapture {
  private initialized = false;
  private running = false;
  private cachedResolution: { width: number; height: number } | null = null;
  private readonly targetFps: number;

  constructor(targetFps = 15) {
    this.targetFps = targetFps;
  }

  async initialize(): Promise<void> {
    // Probe that a screenshot can be taken. This is where macOS will surface
    // the Screen Recording permission prompt if it hasn't been granted yet.
    // If it throws with a permission error, we let it propagate — the caller
    // (agent.ts) wraps this in a try/catch and prints remediation guidance.
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
    // Attempt a probe screenshot to test permissions rather than relying on
    // a separate permission-check API (screencapture doesn't expose one).
    try {
      const { screenshot } = loadDeps();
      await screenshot({ format: "jpg" });
      return { granted: true };
    } catch {
      return {
        granted: false,
        instructions:
          "Open System Settings → Privacy & Security → Screen Recording " +
          "and enable it for TetherDesk Agent (or the Terminal app running it). " +
          "Then restart the agent.",
      };
    }
  }
}
