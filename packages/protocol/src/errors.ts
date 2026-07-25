/** Enumerated API/protocol error codes. Keep this list the single source of truth so
 * agent/PWA UI can react to specific failures rather than showing generic messages. */
export const ErrorCode = {
  PAIRING_TOKEN_EXPIRED: "PAIRING_TOKEN_EXPIRED",
  PAIRING_TOKEN_ALREADY_USED: "PAIRING_TOKEN_ALREADY_USED",
  PAIRING_TOKEN_NOT_FOUND: "PAIRING_TOKEN_NOT_FOUND",
  DEVICE_REVOKED: "DEVICE_REVOKED",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  STORE_UNAVAILABLE: "STORE_UNAVAILABLE",
  ICE_NO_VIABLE_PATH: "ICE_NO_VIABLE_PATH",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Whether a client should retry the request that produced this error code. */
export const RETRYABLE_ERROR_CODES: ReadonlySet<ErrorCode> = new Set([
  ErrorCode.RATE_LIMITED,
  ErrorCode.STORE_UNAVAILABLE,
]);

export interface ApiError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export function makeApiError(code: ErrorCode, message: string): ApiError {
  return { code, message, retryable: RETRYABLE_ERROR_CODES.has(code) };
}
