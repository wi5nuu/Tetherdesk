import { describe, expect, it } from "vitest";
import { ErrorCode, makeApiError } from "../src/errors.js";
import { apiErr, apiOk } from "../src/api.js";

describe("error envelope helpers", () => {
  it("marks RATE_LIMITED as retryable", () => {
    const error = makeApiError(ErrorCode.RATE_LIMITED, "too many attempts");
    expect(error.retryable).toBe(true);
  });

  it("marks PAIRING_TOKEN_ALREADY_USED as non-retryable", () => {
    const error = makeApiError(ErrorCode.PAIRING_TOKEN_ALREADY_USED, "already used");
    expect(error.retryable).toBe(false);
  });

  it("builds an ok ApiResponse", () => {
    expect(apiOk({ foo: 1 })).toEqual({ ok: true, data: { foo: 1 } });
  });

  it("builds an error ApiResponse", () => {
    const error = makeApiError(ErrorCode.VALIDATION_FAILED, "bad input");
    expect(apiErr(error)).toEqual({ ok: false, error });
  });
});
