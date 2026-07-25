import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { redisKeys } from "@/lib/keys";
import { authenticateRequest, verifyAgentSecret } from "@/lib/auth";

export const runtime = "nodejs";

// How long an approval request stays pending before it auto-expires (90s = same as pairing token)
const APPROVAL_REQUEST_TTL = 90;
// How long the approval result is held so the agent can read it once (30s is plenty)
const APPROVAL_RESULT_TTL = 30;

export type ApprovalStatus = "pending" | "approved" | "declined";

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

  const redis = getRedis();

  // Check if there is a pending approval request from the agent
  const [reqRaw, resRaw] = await Promise.all([
    redis.get<string>(redisKeys.approvalRequest(sessionId)),
    redis.get<string>(redisKeys.approvalResult(sessionId)),
  ]);

  // Agent posted a result already (approved or declined)
  if (resRaw) {
    const result =
      typeof resRaw === "string"
        ? (JSON.parse(resRaw) as { status: ApprovalStatus; decidedAt: number })
        : (resRaw as { status: ApprovalStatus; decidedAt: number });
    return NextResponse.json({ ok: true, data: result });
  }

  // No request from agent yet
  if (!reqRaw) {
    return NextResponse.json({ ok: false, error: "no pending approval" }, { status: 404 });
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
}

// --------------------------------------------------------------------------
// POST /api/pairing/approval
//   Body: { action: "request", sessionId, deviceFingerprint? }
//     → Agent posts this after pairing to register that a phone is waiting.
//   Body: { action: "respond", sessionId, approved: boolean }
//     → Laptop dashboard posts this when the user clicks approve/decline.
// --------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    action?: string;
    sessionId?: string;
    deviceFingerprint?: string;
    approved?: boolean;
  };

  if (!body.sessionId || !body.action) {
    return NextResponse.json({ ok: false, error: "missing sessionId or action" }, { status: 400 });
  }

  const redis = getRedis();
  const { sessionId, action } = body;

  if (action === "request") {
    // Agent registers a new approval request — requires AGENT_SECRET
    if (!verifyAgentSecret(request)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const payload = JSON.stringify({
      sessionId,
      requestedAt: Date.now(),
      deviceFingerprint: body.deviceFingerprint ?? null,
    });
    await redis.set(redisKeys.approvalRequest(sessionId), payload, {
      ex: APPROVAL_REQUEST_TTL,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "respond") {
    // Laptop dashboard responds to approval — requires valid JWT with role=laptop
    const auth = await authenticateRequest(request);
    if (!auth.ok || auth.claims.role !== "laptop" || auth.claims.sessionId !== sessionId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    if (typeof body.approved !== "boolean") {
      return NextResponse.json({ ok: false, error: "missing approved boolean" }, { status: 400 });
    }
    const status: ApprovalStatus = body.approved ? "approved" : "declined";
    const payload = JSON.stringify({ status, decidedAt: Date.now() });

    // Write result and clean up the request key atomically
    await Promise.all([
      redis.set(redisKeys.approvalResult(sessionId), payload, { ex: APPROVAL_RESULT_TTL }),
      redis.del(redisKeys.approvalRequest(sessionId)),
    ]);
    return NextResponse.json({ ok: true, data: { status } });
  }

  return NextResponse.json({ ok: false, error: `unknown action: ${action}` }, { status: 400 });
}
