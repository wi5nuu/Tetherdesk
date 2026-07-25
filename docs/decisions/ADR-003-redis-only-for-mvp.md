# ADR-003: Redis-Only for MVP (Postgres Optional)

**Date:** 2026-07-24
**Status:** Accepted

---

## Context

The spec (Section 9.2) describes a Postgres schema for durable device history, audit logs, and multi-device management. It also states Postgres is "optional, Phase 4+, not required for MVP."

## Decision

The MVP implementation (Phases 0–3) uses Redis only. Postgres is not wired in. All device and session state required for Phases 0–3 (FR-1 through FR-8) is stored in Redis with appropriate TTLs.

The `GET /api/devices` and `DELETE /api/devices/{id}` routes are implemented against Redis session/revocation keys rather than a Postgres device table.

## Consequences

- **Positive:** Zero Postgres dependency for setup, zero Neon provisioning step, smaller cold-start bundle.
- **Positive:** The free tier constraint (Section 3) is trivially satisfied — Redis usage is minimal at personal scale.
- **Negative:** Device history (when was each device last seen, full pairing event log) is not persistent across Redis TTL expiry. Acceptable for a single-user personal tool.
- **Negative:** If Postgres is added in Phase 4, the `devices` API responses may change shape slightly. This is an additive change, not a breaking one.

## Migration path

Phase 4 adds Postgres behind a `TETHERDESK_ENABLE_POSTGRES=true` feature flag. When enabled, device registration writes to both Redis (for fast lookups) and Postgres (for durable history). The API response shape is backwards-compatible.
