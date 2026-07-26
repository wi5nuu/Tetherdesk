/**
 * Shared robotjs-based input injection logic used by all three platform
 * implementations (macOS, Windows, Linux).
 *
 * @jitsi/robotjs is a maintained fork of robotjs that ships pre-built binaries
 * for Node 18–24 on Windows, macOS, and Linux (X11). It uses:
 *   - macOS: CGEvent (Accessibility permission required)
 *   - Windows: SendInput
 *   - Linux: XTest extension (X11 only; Wayland requires XWayland)
 *
 * This module is NOT exported from the package root — it is an internal
 * implementation detail shared by the per-platform wrapper classes.
 */

import { createRequire } from "node:module";

// Button mask constants used by robotjs
const BUTTON_LEFT = 0x01;
const BUTTON_RIGHT = 0x02;
const BUTTON_MIDDLE = 0x04;

// Web KeyboardEvent.code → robotjs key name mapping.
// robotjs uses its own key name strings, not DOM key codes.
// Only the most common keys are mapped here; unknown codes fall back to
// a best-effort lowercase strip of the "Key"/"Digit" prefix.
const KEY_MAP: Record<string, string> = {
  // Modifiers
  ShiftLeft: "shift", ShiftRight: "shift",
  ControlLeft: "control", ControlRight: "control",
  AltLeft: "alt", AltRight: "alt",
  MetaLeft: "command", MetaRight: "command",
  // Navigation
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown",
  // Editing
  Backspace: "backspace", Delete: "delete", Insert: "insert",
  Enter: "enter", Tab: "tab", Escape: "escape", Space: "space",
  CapsLock: "caps_lock",
  // Function keys
  F1: "f1", F2: "f2", F3: "f3", F4: "f4", F5: "f5", F6: "f6",
  F7: "f7", F8: "f8", F9: "f9", F10: "f10", F11: "f11", F12: "f12",
  // Numpad
  Numpad0: "numpad_0", Numpad1: "numpad_1", Numpad2: "numpad_2",
  Numpad3: "numpad_3", Numpad4: "numpad_4", Numpad5: "numpad_5",
  Numpad6: "numpad_6", Numpad7: "numpad_7", Numpad8: "numpad_8",
  Numpad9: "numpad_9",
  NumpadAdd: "numpad_+", NumpadSubtract: "numpad_-",
  NumpadMultiply: "numpad_*", NumpadDivide: "numpad_/",
  NumpadEnter: "enter", NumpadDecimal: "numpad_.",
  // Punctuation (Digit/Key prefixes are stripped in the fallback below)
  Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
  Backslash: "\\", Semicolon: ";", Quote: "'", Backtick: "`",
  Comma: ",", Period: ".", Slash: "/",
};

type RobotJs = {
  moveMouse(x: number, y: number): void;
  mouseToggle(down: "down" | "up", button: "left" | "right" | "middle"): void;
  scrollMouse(x: number, y: number): void;
  keyToggle(key: string, down: "down" | "up"): void;
  getScreenSize(): { width: number; height: number };
};

function loadRobotJs(): RobotJs {
  const _require = createRequire(import.meta.url);
  return _require("@jitsi/robotjs") as RobotJs;
}

function codeToRobotKey(code: string): string {
  if (code in KEY_MAP) return KEY_MAP[code]!;
  // Strip "Key" prefix (e.g. "KeyA" → "a") and "Digit" prefix (e.g. "Digit1" → "1")
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  return code.toLowerCase();
}

function activeButtons(buttons: number): Array<"left" | "right" | "middle"> {
  const result: Array<"left" | "right" | "middle"> = [];
  if (buttons & BUTTON_LEFT) result.push("left");
  if (buttons & BUTTON_RIGHT) result.push("right");
  if (buttons & BUTTON_MIDDLE) result.push("middle");
  return result;
}

export class RobotJsInjector {
  private robot: RobotJs | null = null;
  // Track which buttons are currently down to send proper up events
  private downButtons = new Set<"left" | "right" | "middle">();

  initialize(): void {
    this.robot = loadRobotJs();
    // Probe that the library is usable with a no-op call
    this.robot.getScreenSize();
  }

  injectPointer(x: number, y: number, buttons: number): void {
    const r = this._require();
    r.moveMouse(Math.round(x), Math.round(y));

    const wanted = new Set(activeButtons(buttons));

    // Release buttons that were down but are no longer
    for (const btn of this.downButtons) {
      if (!wanted.has(btn)) {
        r.mouseToggle("up", btn);
        this.downButtons.delete(btn);
      }
    }
    // Press buttons that are newly down
    for (const btn of wanted) {
      if (!this.downButtons.has(btn)) {
        r.mouseToggle("down", btn);
        this.downButtons.add(btn);
      }
    }
  }

  injectScroll(dx: number, dy: number): void {
    const r = this._require();
    // robotjs scrollMouse(x, y): positive y = scroll down, positive x = scroll right
    r.scrollMouse(Math.round(dx), Math.round(dy));
  }

  injectKey(code: string, down: boolean): void {
    const r = this._require();
    const key = codeToRobotKey(code);
    r.keyToggle(key, down ? "down" : "up");
  }

  cleanup(): void {
    // Release any held buttons before cleanup to avoid stuck buttons
    if (this.robot) {
      for (const btn of this.downButtons) {
        try { this.robot.mouseToggle("up", btn); } catch { /* best-effort */ }
      }
    }
    this.downButtons.clear();
    this.robot = null;
  }

  private _require(): RobotJs {
    if (!this.robot) throw new Error("RobotJsInjector not initialized");
    return this.robot;
  }
}
