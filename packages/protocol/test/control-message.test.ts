import { describe, expect, it } from "vitest";
import {
  decodeControlMessage,
  encodeControlMessage,
  type ControlMessage,
} from "../src/control-message.js";

describe("ControlMessage JSON codec", () => {
  it("round-trips a clipboard message", () => {
    const message: ControlMessage = { t: "clipboard", data: "hello world" };
    expect(decodeControlMessage(encodeControlMessage(message))).toEqual(message);
  });

  it("round-trips a resolutionChanged message", () => {
    const message: ControlMessage = { t: "resolutionChanged", width: 1920, height: 1080 };
    expect(decodeControlMessage(encodeControlMessage(message))).toEqual(message);
  });

  it("round-trips a heartbeat message", () => {
    const message: ControlMessage = { t: "heartbeat", ts: 1719000000000 };
    expect(decodeControlMessage(encodeControlMessage(message))).toEqual(message);
  });

  it("throws on non-object JSON", () => {
    expect(() => decodeControlMessage("42")).toThrow(TypeError);
  });

  it("throws on an object missing 't'", () => {
    expect(() => decodeControlMessage(JSON.stringify({ foo: "bar" }))).toThrow(TypeError);
  });

  it("throws on an unknown message type", () => {
    expect(() => decodeControlMessage(JSON.stringify({ t: "bogus" }))).toThrow(TypeError);
  });

  it("throws on a clipboard message with non-string data", () => {
    expect(() => decodeControlMessage(JSON.stringify({ t: "clipboard", data: 5 }))).toThrow(
      TypeError,
    );
  });

  it("throws on a resolutionChanged message with missing fields", () => {
    expect(() =>
      decodeControlMessage(JSON.stringify({ t: "resolutionChanged", width: 100 })),
    ).toThrow(TypeError);
  });

  it("throws on a heartbeat message with non-number ts", () => {
    expect(() => decodeControlMessage(JSON.stringify({ t: "heartbeat", ts: "now" }))).toThrow(
      TypeError,
    );
  });
});
