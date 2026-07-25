/**
 * GET  /api/events  — SSE stream for real-time activity log on the dashboard.
 * POST /api/events  — Agent pushes activity events (pairing stages, WebRTC state, etc.)
 *
 * Uses an in-process EventEmitter as the pub/sub bus. This works for a single
 * Next.js server process (local dev + single-instance production). For multi-
 * instance deployments, replace with Redis Pub/Sub.
 */

import { NextRequest, NextResponse } from "next/server";
import { EventEmitter } from "node:events";
import { verifyAgentSecret } from "@/lib/auth";

export const runtime = "nodejs";
// Disable Next.js response caching for SSE
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Shared in-process event bus
// ---------------------------------------------------------------------------

const bus = new EventEmitter();
bus.setMaxListeners(200); // support many dashboard tabs

export type ActivityEvent = {
  id: string;
  ts: number;
  level: "info" | "warn" | "error" | "success";
  stage:
    | "agent"
    | "pairing"
    | "keyexchange"
    | "approval"
    | "webrtc"
    | "connection"
    | "system";
  message: string;
  sessionId?: string;
};

let eventCounter = 0;

function makeId(): string {
  return `evt_${Date.now()}_${++eventCounter}`;
}

// Keep last 100 events in memory so new SSE subscribers catch up
const recentEvents: ActivityEvent[] = [];
const MAX_RECENT = 100;

function pushEvent(event: Omit<ActivityEvent, "id" | "ts">): ActivityEvent {
  const full: ActivityEvent = { ...event, id: makeId(), ts: Date.now() };
  recentEvents.push(full);
  if (recentEvents.length > MAX_RECENT) recentEvents.shift();
  bus.emit("event", full);
  return full;
}

// ---------------------------------------------------------------------------
// POST /api/events — agent pushes an event (requires AGENT_SECRET)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // Only the agent (identified by AGENT_SECRET) may push events.
  // Unauthenticated POST would let any internet user spam the dashboard log.
  if (!verifyAgentSecret(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const level = (b.level as ActivityEvent["level"]) ?? "info";
  const stage = (b.stage as ActivityEvent["stage"]) ?? "system";
  const message = typeof b.message === "string" ? b.message : String(b.message ?? "");
  const sessionId = typeof b.sessionId === "string" ? b.sessionId : undefined;

  if (!message) {
    return NextResponse.json({ ok: false, error: "missing message" }, { status: 400 });
  }

  const event = pushEvent({ level, stage, message, ...(sessionId !== undefined && { sessionId }) });
  return NextResponse.json({ ok: true, data: { id: event.id } });
}

// ---------------------------------------------------------------------------
// GET /api/events — SSE stream
// ---------------------------------------------------------------------------
export async function GET(_request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send all recent events as catch-up
      for (const evt of recentEvents) {
        const data = `data: ${JSON.stringify(evt)}\n\n`;
        controller.enqueue(encoder.encode(data));
      }

      // Send keepalive comment every 15s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 15_000);

      // Subscribe to new events
      const onEvent = (evt: ActivityEvent) => {
        try {
          const data = `data: ${JSON.stringify(evt)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch {
          bus.off("event", onEvent);
          clearInterval(keepalive);
        }
      };

      bus.on("event", onEvent);

      // Cleanup when client disconnects
      return () => {
        bus.off("event", onEvent);
        clearInterval(keepalive);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
