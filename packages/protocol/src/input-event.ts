/** Binary-encoded input event schema (packets sent at pointer-move frequency over the
 * WebRTC data channel). JSON is deliberately avoided here to minimize per-message overhead —
 * see ControlMessage for the JSON-acceptable, low-frequency counterpart. */
export type InputEvent =
  | { t: "pointer"; x: number; y: number; buttons: number; ts: number }
  | { t: "scroll"; dx: number; dy: number; ts: number }
  | { t: "key"; code: string; down: boolean; ts: number }
  | { t: "touch"; points: { id: number; x: number; y: number }[]; ts: number };

const TAG = {
  pointer: 0,
  scroll: 1,
  key: 2,
  touch: 3,
} as const;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeInputEvent(event: InputEvent): Uint8Array {
  switch (event.t) {
    case "pointer": {
      // BUG-22: Float64 at offset 10 would be unaligned (offset must be multiple of 8).
      // Layout: [0]=tag(u8) [1-4]=x(f32) [5-8]=y(f32) [9]=buttons(u8) [10-11]=pad(u16) [12-19]=ts(f64)
      // Total: 20 bytes. The 2-byte pad at [10-11] ensures ts starts at offset 12, which is 8-byte aligned.
      const buf = new ArrayBuffer(20);
      const view = new DataView(buf);
      view.setUint8(0, TAG.pointer);
      view.setFloat32(1, event.x, true);
      view.setFloat32(5, event.y, true);
      view.setUint8(9, event.buttons);
      // [10-11]: 2 bytes padding to align ts at offset 12
      view.setUint16(10, 0, true);
      view.setFloat64(12, event.ts, true);
      return new Uint8Array(buf);
    }
    case "scroll": {
      const buf = new ArrayBuffer(17);
      const view = new DataView(buf);
      view.setUint8(0, TAG.scroll);
      view.setFloat32(1, event.dx, true);
      view.setFloat32(5, event.dy, true);
      view.setFloat64(9, event.ts, true);
      return new Uint8Array(buf);
    }
    case "key": {
      const codeBytes = textEncoder.encode(event.code);
      if (codeBytes.length > 255) {
        throw new RangeError(`key code too long to encode: ${event.code}`);
      }
      const buf = new ArrayBuffer(11 + codeBytes.length);
      const view = new DataView(buf);
      view.setUint8(0, TAG.key);
      view.setUint8(1, event.down ? 1 : 0);
      view.setFloat64(2, event.ts, true);
      view.setUint8(10, codeBytes.length);
      new Uint8Array(buf, 11).set(codeBytes);
      return new Uint8Array(buf);
    }
    case "touch": {
      if (event.points.length > 255) {
        throw new RangeError("touch event cannot encode more than 255 points");
      }
      const buf = new ArrayBuffer(10 + event.points.length * 9);
      const view = new DataView(buf);
      view.setUint8(0, TAG.touch);
      view.setFloat64(1, event.ts, true);
      view.setUint8(9, event.points.length);
      let offset = 10;
      for (const point of event.points) {
        view.setUint8(offset, point.id);
        view.setFloat32(offset + 1, point.x, true);
        view.setFloat32(offset + 5, point.y, true);
        offset += 9;
      }
      return new Uint8Array(buf);
    }
    default: {
      const exhaustive: never = event;
      throw new Error(`unreachable input event: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function decodeInputEvent(bytes: Uint8Array): InputEvent {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 1) {
    throw new RangeError("empty input event buffer");
  }
  const tag = view.getUint8(0);
  switch (tag) {
    case TAG.pointer: {
      // BUG-22: updated to match encoder layout — 20 bytes, ts at offset 12 (8-byte aligned)
      requireLength(bytes, 20, "pointer");
      return {
        t: "pointer",
        x: view.getFloat32(1, true),
        y: view.getFloat32(5, true),
        buttons: view.getUint8(9),
        // [10-11] is alignment padding — skip it
        ts: view.getFloat64(12, true),
      };
    }
    case TAG.scroll: {
      requireLength(bytes, 17, "scroll");
      return {
        t: "scroll",
        dx: view.getFloat32(1, true),
        dy: view.getFloat32(5, true),
        ts: view.getFloat64(9, true),
      };
    }
    case TAG.key: {
      requireMinLength(bytes, 11, "key");
      const codeLen = view.getUint8(10);
      requireLength(bytes, 11 + codeLen, "key");
      const code = textDecoder.decode(bytes.subarray(11, 11 + codeLen));
      return {
        t: "key",
        down: view.getUint8(1) === 1,
        ts: view.getFloat64(2, true),
        code,
      };
    }
    case TAG.touch: {
      requireMinLength(bytes, 10, "touch");
      const count = view.getUint8(9);
      requireLength(bytes, 10 + count * 9, "touch");
      const points: { id: number; x: number; y: number }[] = [];
      let offset = 10;
      for (let i = 0; i < count; i++) {
        points.push({
          id: view.getUint8(offset),
          x: view.getFloat32(offset + 1, true),
          y: view.getFloat32(offset + 5, true),
        });
        offset += 9;
      }
      return { t: "touch", ts: view.getFloat64(1, true), points };
    }
    default:
      throw new RangeError(`unknown input event tag: ${tag}`);
  }
}

function requireLength(bytes: Uint8Array, expected: number, kind: string): void {
  if (bytes.length !== expected) {
    throw new RangeError(
      `malformed ${kind} input event: expected ${expected} bytes, got ${bytes.length}`,
    );
  }
}

function requireMinLength(bytes: Uint8Array, min: number, kind: string): void {
  if (bytes.length < min) {
    throw new RangeError(
      `malformed ${kind} input event: expected at least ${min} bytes, got ${bytes.length}`,
    );
  }
}
