import type { NextRequest, NextResponse } from "next/server";
import { ErrorCode, type ApiResponse } from "@tetherdesk/protocol";
import { getClientIp, jsonError, jsonOk, parseJsonBody } from "@/lib/http";
import { pairingConfirmSchema } from "@/lib/validation";
import { confirmPairing } from "@/lib/pairing";
import { checkPairingConfirmRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
// One Redis GETDEL (atomic token consumption) + one Redis write (session update) +
// one mailbox push + one JWT sign — all sub-100ms operations (Section 16.1).
export const maxDuration = 10;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<{ sessionId: string; bearerToken: string }>>> {
  // Rate limit by IP (Section 15.3): 5 attempts per 15 minutes, fail-closed on Redis error.
  const ip = getClientIp(request);
  const rateLimit = await checkPairingConfirmRateLimit(ip);
  if (!rateLimit.allowed) {
    return jsonError(ErrorCode.RATE_LIMITED, "too many pairing attempts — try again later");
  }

  const body = await parseJsonBody(request);
  const parsed = pairingConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message ?? "invalid request body");
  }

  try {
    const result = await confirmPairing(parsed.data);
    if (!result.ok) {
      return jsonError(result.error, "pairing confirmation failed");
    }
    return jsonOk({ sessionId: result.sessionId, bearerToken: result.bearerToken }, 200);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "pairing_confirm_failed",
        errorType: error instanceof Error ? error.name : "unknown",
      }),
    );
    return jsonError(ErrorCode.STORE_UNAVAILABLE, "failed to confirm pairing session");
  }
}
