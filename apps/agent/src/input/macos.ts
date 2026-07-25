/**
 * macOS input injection implementation using @jitsi/robotjs.
 *
 * @jitsi/robotjs uses CGEvent under the hood on macOS, which requires the
 * Accessibility permission (System Settings → Privacy & Security →
 * Accessibility). The OS will prompt the user the first time any synthetic
 * input is injected; per Section 1.3 item 5 this prompt is never suppressed.
 *
 * If the permission is not granted, robotjs operations will silently no-op
 * on macOS (CGEvent fails without throwing). initialize() probes with a
 * no-op getScreenSize() call which succeeds regardless, so we cannot detect
 * the permission state programmatically — checkPermissions() therefore
 * returns instructions rather than trying to detect the grant state.
 *
 * Touch injection is not supported by robotjs on any platform; touch events
 * from the phone are translated to pointer events before reaching this layer.
 */

import type { InputInjector } from "./index.js";
import { RobotJsInjector } from "./robotjs-injector.js";

export class MacOSInputInjector implements InputInjector {
  private readonly robot = new RobotJsInjector();
  private initialized = false;

  async initialize(): Promise<void> {
    this.robot.initialize();
    this.initialized = true;
  }

  async injectPointer(x: number, y: number, buttons: number): Promise<void> {
    if (!this.initialized) throw new Error("Call initialize() first");
    this.robot.injectPointer(x, y, buttons);
  }

  async injectScroll(dx: number, dy: number): Promise<void> {
    if (!this.initialized) throw new Error("Call initialize() first");
    this.robot.injectScroll(dx, dy);
  }

  async injectKey(code: string, down: boolean): Promise<void> {
    if (!this.initialized) throw new Error("Call initialize() first");
    this.robot.injectKey(code, down);
  }

  async injectTouch(points: Array<{ id: number; x: number; y: number }>): Promise<void> {
    if (!this.initialized) throw new Error("Call initialize() first");
    // robotjs does not support multi-touch; synthesize a pointer event from
    // the first touch point as a best-effort fallback.
    if (points.length > 0) {
      const first = points[0]!;
      this.robot.injectPointer(first.x, first.y, 0);
    }
  }

  async checkPermissions(): Promise<{ granted: boolean; instructions?: string }> {
    // CGEvent permission state is not programmatically readable before macOS 15.
    // Returning instructions unconditionally is the honest approach.
    return {
      granted: false,
      instructions:
        "Open System Settings → Privacy & Security → Accessibility " +
        "and enable it for TetherDesk Agent (or the Terminal running it). " +
        "Then restart the agent. Without this permission, input injection " +
        "will silently no-op on macOS.",
    };
  }

  async cleanup(): Promise<void> {
    this.robot.cleanup();
    this.initialized = false;
  }
}
