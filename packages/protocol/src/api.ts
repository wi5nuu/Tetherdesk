import type { ApiError } from "./errors.js";

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function apiOk<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function apiErr<T>(error: ApiError): ApiResponse<T> {
  return { ok: false, error };
}
