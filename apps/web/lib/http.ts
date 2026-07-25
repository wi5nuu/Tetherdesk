import { NextResponse } from "next/server";
import { apiErr, apiOk, makeApiError, ErrorCode, type ApiResponse } from "@tetherdesk/protocol";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  [ErrorCode.PAIRING_TOKEN_EXPIRED]: 410,
  [ErrorCode.PAIRING_TOKEN_ALREADY_USED]: 409,
  [ErrorCode.PAIRING_TOKEN_NOT_FOUND]: 404,
  [ErrorCode.DEVICE_REVOKED]: 403,
  [ErrorCode.SESSION_NOT_FOUND]: 404,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.STORE_UNAVAILABLE]: 503,
  [ErrorCode.ICE_NO_VIABLE_PATH]: 502,
  [ErrorCode.INTERNAL_ERROR]: 500,
};

export function jsonOk<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json(apiOk(data), { status });
}

export function jsonError(code: ErrorCode, message: string): NextResponse<ApiResponse<never>> {
  return NextResponse.json(apiErr(makeApiError(code, message)), { status: STATUS_BY_CODE[code] });
}

/** Parses the request body as JSON, returning `undefined` (never throwing) on malformed input
 * so callers can uniformly respond with VALIDATION_FAILED. */
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
