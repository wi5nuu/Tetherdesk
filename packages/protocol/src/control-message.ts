/** Infrequent control-plane messages (clipboard sync, resolution change, heartbeat).
 * JSON-encoded — these are low-frequency, unlike InputEvent, so wire-size doesn't matter. */
export type ControlMessage =
  | { t: "clipboard"; data: string }
  | { t: "resolutionChanged"; width: number; height: number }
  | { t: "heartbeat"; ts: number };

export function encodeControlMessage(message: ControlMessage): string {
  return JSON.stringify(message);
}

export function decodeControlMessage(raw: string): ControlMessage {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || !("t" in parsed)) {
    throw new TypeError("malformed control message: not an object with a 't' field");
  }
  const candidate = parsed as Record<string, unknown>;
  switch (candidate["t"]) {
    case "clipboard":
      if (typeof candidate["data"] !== "string") {
        throw new TypeError("malformed clipboard control message");
      }
      return { t: "clipboard", data: candidate["data"] };
    case "resolutionChanged": {
      const w = candidate["width"];
      const h = candidate["height"];
      if (
        typeof w !== "number" || typeof h !== "number" ||
        !Number.isFinite(w) || !Number.isFinite(h) ||
        w <= 0 || h <= 0 ||
        !Number.isInteger(w) || !Number.isInteger(h)
      ) {
        throw new TypeError("malformed resolutionChanged control message: width and height must be positive integers");
      }
      return { t: "resolutionChanged", width: w, height: h };
    }
    case "heartbeat":
      if (typeof candidate["ts"] !== "number") {
        throw new TypeError("malformed heartbeat control message");
      }
      return { t: "heartbeat", ts: candidate["ts"] };
    default:
      throw new TypeError(`unknown control message type: ${String(candidate["t"])}`);
  }
}
