/**
 * Windows input injection implementation using @jitsi/robotjs.
 *
 * @jitsi/robotjs uses SendInput under the hood on Windows, which is the
 * correct modern API for synthetic keyboard and mouse input. It does not
 * require UAC elevation for the interactive user session, but UIPI (User
 * Interface Privilege Isolation) may block injection into elevated windows
 * unless the agent itself runs elevated. This limitation is documented, not
 * silently worked around.
 *
 * Touch injection is not supported by robotjs; touch events from the phone
 * are translated to pointer events as a best-effort fallback.
 */

import type { InputInjector } from "./index.js";
import { RobotJsInjector } from "./robotjs-injector.js";

export class WindowsInputInjector implements InputInjector {
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
    // robotjs does not support multi-touch on Windows. Synthesize a pointer
    // event from the first touch point as a best-effort fallback.
    // Full touch injection requires the Touch Injection API (Windows 8+) and
    // a native addon — planned for Phase 3.
    if (points.length > 0) {
      const first = points[0]!;
      this.robot.injectPointer(first.x, first.y, 0);
    }
  }

  async checkPermissions(): Promise<{ granted: boolean; instructions?: string }> {
    // SendInput generally does not require special permissions for the
    // interactive user. If the agent is not running elevated, it cannot inject
    // into applications running with elevated (administrator) privileges —
    // this is a Windows UIPI security restriction, not a TetherDesk limitation.
    return {
      granted: true,
      instructions:
        "Note: TetherDesk cannot inject input into applications running with " +
        "elevated (administrator) privileges unless the agent itself is also " +
        "elevated. This is a Windows UIPI security restriction.",
    };
  }

  async cleanup(): Promise<void> {
    this.robot.cleanup();
    this.initialized = false;
  }
}
