/**
 * Windows screen capture implementation using screenshot-desktop + jpeg-js.
 *
 * screenshot-desktop invokes the platform's native screenshot mechanism
 * (on Windows: a PowerShell/WinAPI call) and returns a JPEG buffer.
 * jpeg-js decodes that to raw RGBA, which is what RTCVideoSource.onFrame()
 * expects. This is a pure-JS path — no native addon required.
 *
 * Frame rate is capped at ~15 fps by default (configurable) to stay within
 * reasonable CPU/bandwidth budgets on a typical laptop.
 *
 * Note: Desktop Duplication API (GPU-accelerated) is the ideal long-term
 * solution for Windows but requires a native addon. This implementation
 * provides a working baseline using only npm-installable packages.
 */

import { createRequire } from "node:module";
import type { ScreenCapture } from "./index.js";

const _require = createRequire(import.meta.url);

// Dynamic requires keep TypeScript from needing type declarations for these
// packages while still allowing runtime availability checks.

type ScreenshotDesktop = (opts?: { format?: string }) => Promise<Buffer>;
type JpegJs = {
  decode(buf: Buffer | Uint8Array, opts?: { useTArray?: boolean }): {
    width: number;
    height: number;
    data: Uint8Array;
  };
};

/**
 * Convert raw RGBA (4 bytes/pixel) to I420 YUV planar (1.5 bytes/pixel).
 * RTCVideoSource.onFrame() in @roamhq/wrtc requires I420 format.
 *
 * I420 layout: Y plane (w×h), U plane (w/2×h/2), V plane (w/2×h/2)
 */
function rgbaToI420(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const ySize = width * height;
  const uvSize = (width >> 1) * (height >> 1);
  const i420 = new Uint8Array(ySize + 2 * uvSize);

  const yPlane = i420.subarray(0, ySize);
  const uPlane = i420.subarray(ySize, ySize + uvSize);
  const vPlane = i420.subarray(ySize + uvSize);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = (row * width + col) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;

      // BT.601 full-range coefficients
      const y = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16;
      yPlane[row * width + col] = y;

      if ((row & 1) === 0 && (col & 1) === 0) {
        const uvRow = row >> 1;
        const uvCol = col >> 1;
        const uvIdx = uvRow * (width >> 1) + uvCol;
        uPlane[uvIdx] = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128;
        vPlane[uvIdx] = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128;
      }
    }
  }
  return i420;
}

function loadDeps(): { screenshot: ScreenshotDesktop; jpegJs: JpegJs } {
  const screenshot = _require("screenshot-desktop") as ScreenshotDesktop;
  const jpegJs = _require("jpeg-js") as JpegJs;
  return { screenshot, jpegJs };
}

export class WindowsScreenCapture implements ScreenCapture {
  private initialized = false;
  private running = false;
  private cachedResolution: { width: number; height: number } | null = null;
  private readonly targetFps: number;

  constructor(targetFps = 15) {
    this.targetFps = targetFps;
  }

  async initialize(): Promise<void> {
    // Probe that deps are loadable and that a screenshot can be taken.
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
            // Cache resolution for getResolution() calls
            self.cachedResolution = { width: frame.width, height: frame.height };
            // RTCVideoSource.onFrame() expects I420 (YUV planar, 1.5 bytes/pixel),
            // not RGBA (4 bytes/pixel). Convert before enqueuing.
            controller.enqueue(rgbaToI420(frame.data, frame.width, frame.height));
          } catch (err) {
            // Surface capture errors to the stream consumer rather than silently dropping
            controller.error(err);
            return;
          }
          // Sleep for the remainder of the frame interval
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
    // Fallback: take a probe screenshot to determine resolution
    const { screenshot, jpegJs } = loadDeps();
    const buf = await screenshot({ format: "jpg" });
    const frame = jpegJs.decode(buf, { useTArray: true });
    this.cachedResolution = { width: frame.width, height: frame.height };
    return this.cachedResolution;
  }

  async checkPermissions(): Promise<{ granted: boolean; instructions?: string }> {
    // Desktop Duplication API does not require special permissions for the
    // interactive user's own session. screenshot-desktop on Windows uses
    // PowerShell which is available to any interactive user.
    return { granted: true };
  }
}
