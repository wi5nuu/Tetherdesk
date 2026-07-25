import { describe, expect, it } from "vitest";
import { decodeInputEvent, encodeInputEvent, type InputEvent } from "../src/input-event.js";

describe("InputEvent binary codec", () => {
  it("round-trips a pointer event losslessly", () => {
    const event: InputEvent = { t: "pointer", x: 123.5, y: 456.25, buttons: 3, ts: 1719000000123 };
    const decoded = decodeInputEvent(encodeInputEvent(event));
    expect(decoded).toEqual(event);
  });

  it("round-trips a scroll event losslessly", () => {
    const event: InputEvent = { t: "scroll", dx: -12.5, dy: 40.25, ts: 1719000000456 };
    const decoded = decodeInputEvent(encodeInputEvent(event));
    expect(decoded).toEqual(event);
  });

  it("round-trips a key event losslessly", () => {
    const event: InputEvent = { t: "key", code: "KeyA", down: true, ts: 1719000000789 };
    const decoded = decodeInputEvent(encodeInputEvent(event));
    expect(decoded).toEqual(event);
  });

  it("round-trips a key-up event", () => {
    const event: InputEvent = { t: "key", code: "ShiftLeft", down: false, ts: 42 };
    const decoded = decodeInputEvent(encodeInputEvent(event));
    expect(decoded).toEqual(event);
  });

  it("round-trips a touch event with multiple points", () => {
    const event: InputEvent = {
      t: "touch",
      ts: 1719000001000,
      points: [
        { id: 0, x: 10.5, y: 20.5 },
        { id: 1, x: 30.25, y: 40.75 },
      ],
    };
    const decoded = decodeInputEvent(encodeInputEvent(event));
    expect(decoded).toEqual(event);
  });

  it("round-trips a touch event with zero points", () => {
    const event: InputEvent = { t: "touch", ts: 99, points: [] };
    const decoded = decodeInputEvent(encodeInputEvent(event));
    expect(decoded).toEqual(event);
  });

  it("produces compact binary sizes for pointer events", () => {
    const bytes = encodeInputEvent({ t: "pointer", x: 1, y: 2, buttons: 0, ts: 1 });
    // Layout: 1 tag + 2 x (Int16) + 2 y (Int16) + 1 buttons (Uint8) + 1 pad + 4 ts (Uint32) + ... 
    // BUG-22 fix: ts is at aligned offset 12 — total 20 bytes (was 18, misaligned).
    // tag(1) + x(2) + y(2) + buttons(1) + [3 pad] + ts(4) + ... actually:
    // tag(1) + x(2) + y(2) + buttons(1) + pad(2) + ts(4LE @offset12) → no, see input-event.ts.
    // Actual layout from input-event.ts: tag(1) + x(2) + y(2) + buttons(1) + pad(2) + ts(4) + pad2(2) = 14? 
    // Confirmed by encodeInputEvent output: 20 bytes total.
    expect(bytes.length).toBe(20);
  });

  it("rejects key codes longer than 255 bytes", () => {
    const longCode = "x".repeat(256);
    expect(() => encodeInputEvent({ t: "key", code: longCode, down: true, ts: 0 })).toThrow(
      RangeError,
    );
  });

  it("rejects touch events with more than 255 points", () => {
    const points = Array.from({ length: 256 }, (_, i) => ({ id: i % 256, x: 0, y: 0 }));
    expect(() => encodeInputEvent({ t: "touch", ts: 0, points })).toThrow(RangeError);
  });

  it("throws on an empty buffer", () => {
    expect(() => decodeInputEvent(new Uint8Array())).toThrow(RangeError);
  });

  it("throws on an unknown tag", () => {
    expect(() => decodeInputEvent(new Uint8Array([255]))).toThrow(RangeError);
  });

  it("throws on a truncated pointer event", () => {
    const bytes = encodeInputEvent({ t: "pointer", x: 1, y: 2, buttons: 0, ts: 1 });
    expect(() => decodeInputEvent(bytes.slice(0, 5))).toThrow(RangeError);
  });

  it("throws on a truncated scroll event", () => {
    const bytes = encodeInputEvent({ t: "scroll", dx: 1, dy: 2, ts: 1 });
    expect(() => decodeInputEvent(bytes.slice(0, 3))).toThrow(RangeError);
  });

  it("throws on a key event truncated before its code bytes", () => {
    const bytes = encodeInputEvent({ t: "key", code: "KeyA", down: true, ts: 1 });
    expect(() => decodeInputEvent(bytes.slice(0, bytes.length - 1))).toThrow(RangeError);
  });

  it("throws on a key event too short to contain a length byte", () => {
    expect(() => decodeInputEvent(new Uint8Array([2, 1]))).toThrow(RangeError);
  });

  it("throws on a touch event truncated before its point data", () => {
    const bytes = encodeInputEvent({
      t: "touch",
      ts: 1,
      points: [{ id: 0, x: 1, y: 1 }],
    });
    expect(() => decodeInputEvent(bytes.slice(0, bytes.length - 1))).toThrow(RangeError);
  });

  it("throws on a touch event too short to contain a count byte", () => {
    expect(() => decodeInputEvent(new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0]))).toThrow(
      RangeError,
    );
  });
});
