import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { redisKeys } from "@/lib/keys";
import { authenticateRequest, verifyAgentSecret } from "@/lib/auth";

export const runtime = "nodejs";

// How long the approval result is held so the agent can read it once (30s is plenty)
const APPROVAL_RESULT_TTL = 30;

export type ApprovalStatus = "idle" | "pending" | "approved" | "declined";

// --------------------------------------------------------------------------
// GET /api/pairing/approval?sessionId=xxx
//   - Laptop dashboard polls this to check if a phone is waiting for approval.
//   - Agent polls this to check if the laptop has approved or declined.
// --------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "missing sessionId" }, { status: 400 });
  }
  if (sessionId.length > 128) {
    return NextResponse.json({ ok: false, error: "sessionId exceeds maximum length" }, { status: 400 });
  }

  try {
    const redis = getRedis();

    const [reqRaw, resRaw] = await Promise.all([
      redis.get<string>(redisKeys.approvalRequest(sessionId)),
      redis.get<string>(redisKeys.approvalResult(sessionId)),
    ]);

    if (resRaw) {
      const result =
        typeof resRaw === "string"
          ? (JSON.parse(resRaw) as { status: ApprovalStatus; decidedAt: number })
          : (resRaw as { status: ApprovalStatus; decidedAt: number });
      return NextResponse.json({ ok: true, data: result });
    }

    if (!reqRaw) {
      // No pending request yet — return idle status (200) so the dashboard
      // poll loop keeps running without logging 404 noise in the dev server.
      return NextResponse.json({ ok: true, data: { status: "idle" as const } });
    }

    const req =
      typeof reqRaw === "string"
        ? (JSON.parse(reqRaw) as { sessionId: string; requestedAt: number; deviceFingerprint?: string })
        : (reqRaw as { sessionId: string; requestedAt: number; deviceFingerprint?: string });

    return NextResponse.json({
      ok: true,
      data: {
        status: "pending" as ApprovalStatus,
        sessionId: req.sessionId,
        requestedAt: req.requestedAt,
        deviceFingerprint: req.deviceFingerprint,
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "approval_get_failed", sessionId, errorType: error instanceof Error ? error.name : "unknown" }));
    return NextResponse.json({ ok: false, error: "service unavailable" }, { status: 503 });
  }
}

// --------------------------------------------------------------------------
// POST /api/pairing/approval
//   Body: { action: "request", sessionId, deviceFingerprint? }
//     → Agent posts this after pairing to register that a phone is waiting.
//   Body: { action: "respond", sessionId, approved: boolean }
//     → Laptop dashboard posts this when the user clicks approve/decline.
// --------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  let body: { action?: string; sessionId?: string; deviceFingerprint?: string; approved?: boolean };
  try {
    body = (await request.json()) as { action?: string; sessionId?: string; deviceFingerprint?: string; approved?: boolean };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.sessionId || !body.action) {
    return NextResponse.json({ ok: false, error: "missing sessionId or action" }, { status: 400 });
  }

  const { sessionId, action } = body;

  if (sessionId.length > 128) {
    return NextResponse.json({ ok: false, error: "sessionId exceeds maximum length" }, { status: 400 });
  }

  if (action !== "request" && action !== "respond") {
    return NextResponse.json({ ok: false, error: "action must be 'request' or 'respond'" }, { status: 400 });
  }

  try {
    const redis = getRedis();

    if (action === "request") {
      if (!verifyAgentSecret(request)) {
        return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }

      // AUTO-APPROVE: Immediately approve all pairing requests without manual confirmation
      // HP scan → backend auto-approves → HP goes directly to /control page
      const approvalPayload = JSON.stringify({ status: "approved" as ApprovalStatus, decidedAt: Date.now() });
      await redis.set(redisKeys.approvalResult(sessionId), approvalPayload, { ex: APPROVAL_RESULT_TTL });
      
      return NextResponse.json({ ok: true, data: { status: "approved" as ApprovalStatus } });
    }

    if (action === "respond") {
      const auth = await authenticateRequest(request);
      if (!auth.ok || auth.claims.role !== "laptop" || auth.claims.sessionId !== sessionId) {
        return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }

      if (typeof body.approved !== "boolean") {
        return NextResponse.json({ ok: false, error: "missing approved boolean" }, { status: 400 });
      }
      const status: ApprovalStatus = body.approved ? "approved" : "declined";
      const payload = JSON.stringify({ status, decidedAt: Date.now() });

      await Promise.all([
        redis.set(redisKeys.approvalResult(sessionId), payload, { ex: APPROVAL_RESULT_TTL }),
        redis.del(redisKeys.approvalRequest(sessionId)),
      ]);
      return NextResponse.json({ ok: true, data: { status } });
    }

    return NextResponse.json({ ok: false, error: "unhandled action" }, { status: 400 });
  } catch (error) {
    console.error(JSON.stringify({ event: "approval_post_failed", sessionId, action, errorType: error instanceof Error ? error.name : "unknown" }));
    return NextResponse.json({ ok: false, error: "service unavailable" }, { status: 503 });
  }
}
