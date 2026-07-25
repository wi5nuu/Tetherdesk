import type { NextRequest, NextResponse } from "next/server";
import { ErrorCode, type ApiResponse } from "@tetherdesk/protocol";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http";
import { pairingStartSchema } from "@/lib/validation";
import { startPairing, type StartPairingResult } from "@/lib/pairing";
import { checkPairingStartRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<StartPairingResult>>> {
  // Rate-limit /api/pairing/start by IP — this is the initiation side and must be
  // protected too, otherwise an attacker can flood Redis with pairing records.
  // Uses the same window/limit as /confirm (Section 15.3).
  const xffHeader = request.headers.get("x-forwarded-for");
  const xffEntries = xffHeader ? xffHeader.split(",").map(s => s.trim()).filter(s => s) : [];
  const ip: string = xffEntries.length > 0 ? xffEntries[xffEntries.length - 1]! : 
                     request.headers.get("x-real-ip") ?? "unknown";

  const rateLimit = await checkPairingStartRateLimit(ip);
  if (!rateLimit.allowed) {
    return jsonError(ErrorCode.RATE_LIMITED, "too many pairing attempts — try again later");
  }

  const body = await parseJsonBody(request);
  const parsed = pairingStartSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message ?? "invalid request body");
  }

  try {
    const result = await startPairing(parsed.data);
    return jsonOk(result, 201);
  } catch (error) {
    console.error(JSON.stringify({ event: "pairing_start_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return jsonError(ErrorCode.STORE_UNAVAILABLE, "failed to start pairing session");
  }
}
