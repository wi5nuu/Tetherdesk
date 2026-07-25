# ADR-001: WebSocket → HTTP Long-Poll Fallback for Signaling

**Date:** 2026-07-24
**Status:** Accepted
**Authors:** Principal Engineer (AI agent per spec Section 0)

---

## Context

The spec (Section 7.2) calls for native Vercel Functions WebSocket as the primary signaling transport, with a long-poll fallback. Vercel shipped native WebSocket support in public beta on 2026-06-22. At the time this system was implemented, the beta API's stability under production workloads was unknown.

Additionally, Vercel Functions have a maximum `maxDuration` (60s on Hobby tier). This means a WebSocket connection used for signaling can only survive for at most 60 seconds before the function is torn down and the client must reconnect.

## Decision

- The signaling layer uses `/api/signal/route.ts` for WebSocket (primary) and `/api/signal/poll/route.ts` for HTTP long-poll (fallback).
- Both implement the same mailbox-drain contract backed by Redis, so switching between them is transparent to the session state.
- Clients (agent and PWA) implement a `SignalingTransport` interface with `WebSocketTransport` and `PollingTransport` implementations and automatically fall back to polling after 2 consecutive WebSocket upgrade failures.
- `maxDuration = 60` is set explicitly on the signaling route with a comment explaining the reconnect design (per spec Section 16.1).

## Consequences

- **Positive:** The system works correctly even if the Vercel WS beta has instability or an intermediate proxy strips `Upgrade` headers.
- **Positive:** Session state is always in Redis, never in function memory — a function recycle is a non-event.
- **Negative:** Long-poll adds 1–2s of latency per reconnect compared to WebSocket. This is acceptable for signaling (which carries only SDP/ICE, not stream data) but must not be confused with the data channel latency.
- **Neutral:** The fallback adds code complexity. This is justified by the beta status of the primary transport.

## Alternatives considered

- **WebSocket only, no fallback:** Simpler code, but one beta outage blocks all pairing/reconnects.
- **Long-poll only:** No beta risk, but higher baseline latency and more polling overhead.
- **Server-Sent Events (SSE) for one direction:** Viable but asymmetric; the polling model is simpler to reason about for both sides.
