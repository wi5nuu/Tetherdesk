/**
 * Linux input injection implementation using @jitsi/robotjs.
 *
 * @jitsi/robotjs uses the XTest extension (XTestFakeKeyEvent,
 * XTestFakeMotionEvent) under the hood on Linux, which works on X11 without
 * any special permissions for the current user's session.
 *
 * Wayland note: robotjs works on Wayland only when XWayland is running (the
 * common case for GNOME/KDE sessions). On a pure Wayland session without
 * XWayland, initialize() will throw because robotjs cannot connect to a
 * display. The error message and checkPermissions() both document this.
 * Full Wayland support via xdg-remote-desktop-portal / libei is planned for
 * Phase 3.
 *
 * Touch injection is not supported by robotjs; touch events from the phone
 * are translated to pointer events as a best-effort fallback.
 */

import type { InputInjector } from "./index.js";
import { RobotJsInjector } from "./robotjs-injector.js";

function detectDisplayServer(): "wayland" | "x11" | "unknown" {
  if (process.env["WAYLAND_DISPLAY"]) return "wayland";
  if (process.env["DISPLAY"]) return "x11";
  return "unknown";
}

export class LinuxInputInjector implements InputInjector {
  private readonly robot = new RobotJsInjector();
  private initialized = false;
  private readonly displayServer: "wayland" | "x11" | "unknown";

  constructor() {
    this.displayServer = detectDisplayServer();
  }

  async initialize(): Promise<void> {
    if (this.displayServer === "unknown") {
      throw new Error(
        "Neither WAYLAND_DISPLAY nor DISPLAY is set. " +
          "TetherDesk Agent must be run inside a graphical desktop session."
      );
    }
    // On pure Wayland without XWayland, robotjs will throw here because it
    // cannot connect to an X11 display. This is expected and the error message
    // is surfaced clearly to the user.
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
    // robotjs does not support multi-touch on Linux. Synthesize a pointer
    // event from the first touch point as a best-effort fallback.
    if (points.length > 0) {
      const first = points[0]!;
      this.robot.injectPointer(first.x, first.y, 0);
    }
  }

  async checkPermissions(): Promise<{ granted: boolean; instructions?: string }> {
    if (this.displayServer === "wayland") {
      return {
        granted: false,
        instructions:
          "On Wayland, input injection requires XWayland to be running. " +
          "Most GNOME and KDE Plasma sessions include XWayland by default. " +
          "If you are on a pure Wayland session without XWayland, input " +
          "injection is not yet supported. Full Wayland support via " +
          "xdg-remote-desktop-portal is planned for Phase 3. " +
          "See docs/runbooks/troubleshooting.md for details.",
      };
    }
    // X11 XTest does not require special permissions for the current user's session.
    return { granted: true };
  }

  async cleanup(): Promise<void> {
    this.robot.cleanup();
    this.initialized = false;
  }
}
