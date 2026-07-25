# MASTER ENGINEERING SPECIFICATION
## Project Codename: TetherDesk — Zero-Infrastructure Remote Laptop Control

**Document type:** AI coding agent execution prompt
**Intended reader:** An autonomous or semi-autonomous AI coding agent (e.g. Claude, GPT-class agent) with full repository, terminal, and deployment access
**Human owner:** A single developer who will run one setup command on their laptop and pair one phone to it
**Hosting constraint:** Vercel only — no self-managed servers, VMs, or paid third-party infrastructure beyond Vercel's own Marketplace add-ons

---

## 0. ROLE AND OPERATING INSTRUCTIONS FOR THE AI CODING AGENT

You are acting as the **Principal Software Architect and Lead Full-Stack/DevOps/Security Engineer** for this project. You have full authority and responsibility to:

- Design and implement the complete system: CLI installer, laptop background agent, Vercel-hosted backend, mobile-facing PWA client, and all supporting infrastructure-as-code.
- Make final, documented engineering decisions wherever this specification leaves a choice open, always favoring the simplest solution that satisfies the constraints below.
- Write production-quality, typed, tested, documented code — not prototypes or proofs-of-concept.
- Treat every "Security Requirements" clause in this document as a hard constraint, not a suggestion.
- Surface any requirement in this document that is technically impossible or unsafe **before** silently working around it. Section 1.3 already documents the known impossibilities so you do not need to rediscover them — implement the documented workarounds instead of over-promising.
- Build incrementally according to the phases in Section 23, producing a working, demoable increment at the end of every phase.
- Never fabricate the appearance of a feature (e.g., a fake "immediate approval" that skips cryptographic verification, or a "single command" that silently requires the user to also click through a browser OAuth prompt without saying so in the docs). Honesty about platform limits is a deliverable, not a footnote.

Do not ask the end user clarifying questions before starting — this document is the complete specification. Where ambiguity remains, apply the stated defaults and document the decision in `/docs/decisions/`.

---

## 1. PROJECT OVERVIEW AND OBJECTIVES

### 1.1 What we are building

**TetherDesk** is a personal remote-control system with two ends:

1. **Laptop side** — a small background agent (installed by a single terminal command) that exposes the laptop's screen and accepts remote keyboard/mouse/touch input.
2. **Phone side** — an installable Progressive Web App (PWA) that, after scanning a QR code shown by the laptop agent, connects to the laptop and lets the user view and control it from anywhere, across different networks, NATs, and countries.

The two ends never need to be on the same network. The only shared infrastructure is a single Vercel deployment acting as a lightweight **rendezvous and signaling service** — it never sees the laptop's screen or the phone's input in unencrypted form, and it never proxies the bulk video/control traffic (see Section 12).

### 1.2 Primary objectives

| # | Objective | Definition of done |
|---|---|---|
| O1 | One-command setup | Running one terminal command on the laptop results in a fully deployed, fully configured backend and a running local agent, with no manual dashboard editing required for the happy path. |
| O2 | Cross-network remote control | The phone can control the laptop when the two devices are on arbitrary, unrelated networks (different Wi-Fi, different mobile carriers, different countries), including behind typical home-router NAT. |
| O3 | QR-based pairing | Pairing is initiated by scanning a QR code rendered in the laptop's terminal (and mirrored on a fallback web page). A successful scan + cryptographic handshake results in an authorized, encrypted session without further manual approval steps. |
| O4 | Zero paid infrastructure beyond Vercel | Every hosted component runs on Vercel's free/Hobby tier by default, using only Vercel-native compute and Vercel Marketplace add-ons that have a no-cost tier. Anything that cannot run on Vercel (see 1.3) is peer-to-peer between the user's own two devices, not a third-party paid service, with one narrowly-scoped, clearly-flagged exception (TURN relay, Section 12.4). |
| O5 | Durable, resumable connection | "Remaining active as long as the agent is running" is interpreted as: the logical session survives transport interruptions (Wi-Fi drop, phone lock, laptop sleep, Vercel function recycling) via automatic reconnect — not as a single unbroken raw socket, which Section 1.3 explains is not achievable on serverless hosting. |
| O6 | Security-first | Compromise of the Vercel-hosted component alone must not be sufficient to gain control of the laptop. Compromise of the pairing QR code image alone (e.g., someone photographs it from across a room within its short validity window) is the realistic residual risk, and it is minimized by short TTLs and single-use tokens. |

### 1.3 Non-negotiable platform realities (read this before designing anything)

This project explicitly asked for automated, invisible infrastructure. Some of that is achievable on Vercel today (as of mid-2026); some of it is not, for reasons rooted in how Vercel's compute model works, not in a lack of effort. Design around these facts rather than against them:

1. **Vercel Functions do not hold a socket open indefinitely.** Vercel shipped native WebSocket support in public beta on **2026-06-22**. It works, but every WebSocket connection is pinned to one Function invocation and is torn down when that invocation hits its **maximum duration** (60s on Hobby by default, configurable; up to 300s default / 800s GA / 1800s beta on Pro). There is no way to keep a single WebSocket alive for hours on Vercel. **Design consequence:** both the laptop agent and the phone PWA must treat the signaling WebSocket as short-lived and auto-reconnecting by default, with all session state kept durable in Redis (Section 9) rather than in Function memory, so a reconnect is invisible to the user.
2. **Vercel cannot host a TURN relay.** TURN requires a stateful process that relays UDP/TCP media between two NATed peers for the life of a call — the opposite of a serverless function. STUN (address discovery) is fine on any infra because it's a single stateless request/response and can even be a free public server. TURN (relay-of-last-resort for symmetric NATs / restrictive firewalls) genuinely needs a long-running relay somewhere. See Section 12.4 for the pragmatic, still-effectively-free options and how the system degrades gracefully without one.
3. **Vercel Marketplace add-ons (Redis, Postgres) are typically provisioned via one dashboard/OAuth interaction the first time**, even though credentials are then injected automatically as environment variables. The setup command should attempt full API automation and fail over to printing one direct link with copy-paste-free instructions if a Marketplace product cannot be provisioned headlessly under the user's account/plan. This is disclosed to the user in the CLI output, not hidden.
4. **DNS and TLS require zero manual configuration** — this is a strength of Vercel, not a gap to work around. Every deployment gets an HTTPS `*.vercel.app` subdomain automatically. There is no DNS work to automate because there is no DNS work. (Custom domains are optional and out of scope for the default flow.)
5. **Screen capture and synthetic input injection are gated by OS-level security prompts** (macOS Screen Recording & Accessibility permissions, Windows UAC for certain input APIs, Wayland's stricter input-injection model on Linux vs. X11). These are consent dialogs the operating system shows to a human, and no legitimate software should try to suppress, auto-click, or bypass them. **Design consequence:** the installer detects missing OS permissions and walks the user through granting them once via deep links to the correct settings pane; it does not attempt to circumvent the prompts.
6. **Provisioning a brand-new Vercel project from a script requires the user to be authenticated to Vercel.** The first run of the setup command will trigger a standard browser-based device-authorization flow (the same pattern used by `vercel login`, `gh auth login`, `supabase login`) if no Vercel token is present. This is one browser click, clearly explained in the CLI, and is the only unavoidable manual step in the entire setup. Everything else is scripted.

None of the above blocks the product. It changes *how* "always-on" and "single command" are implemented — via reconnect-and-resume rather than one eternal socket, and via one disclosed OAuth click rather than a literal zero-interaction install.

---

## 2. FUNCTIONAL REQUIREMENTS

**FR-1 — Setup command.** `npx tetherdesk init` (published npm package, run via `npx` so no separate global install is required) performs, in order: prerequisite checks → Vercel authentication (device flow if needed) → project creation and deployment via the Vercel REST API → Marketplace Redis provisioning attempt → environment variable generation and upload → deployment health check → local agent installation as an OS-level background service → OS permission checks/guidance → first pairing session start → QR code render.

**FR-2 — Background agent.** A long-running local process (`tetherdesk-agentd`) that: maintains a durable logical connection to the backend; captures the screen; injects synthetic keyboard/mouse/touch events; encrypts and streams control data peer-to-peer to a paired phone; exposes a local CLI (`tetherdesk status`, `tetherdesk pair`, `tetherdesk revoke <device>`, `tetherdesk logs`, `tetherdesk stop`).

**FR-3 — QR pairing.** The agent generates a single-use pairing token bound to an ephemeral asymmetric keypair, renders it as a QR code in the terminal (ASCII/Unicode block art) and simultaneously serves it at a local fallback URL for terminals that can't render QR well. The QR encodes enough information for the phone to reach the correct backend deployment, the correct pairing session, and to begin the cryptographic handshake — with no separate "enter this code" step required.

**FR-4 — Phone PWA.** An installable web app (works on iOS Safari and Android Chrome home-screen install) that: scans the QR via camera; completes the pairing handshake; renders the laptop's live screen; captures touch/gesture input and translates it to mouse/keyboard/scroll events; supports basic clipboard sync and session-quality indicators (connection state, latency, relay-vs-direct).

**FR-5 — Session persistence.** If the phone locks, backgrounds, or loses signal, and reconnects within a configurable grace period (default 24 hours) while the agent is still running, the session resumes without re-scanning the QR code.

**FR-6 — Multi-device management.** The user can pair more than one phone/tablet to the same laptop, see a list of paired devices with last-seen timestamps, and revoke any device instantly (revocation takes effect within one signaling round-trip, typically under 5 seconds).

**FR-7 — Cross-network operation.** Pairing and control must work when the laptop and phone are on different Wi-Fi networks, different mobile carriers, and different countries, using the WebRTC + STUN/TURN design in Section 12.

**FR-8 — Graceful degradation.** If the machines cannot establish a direct peer-to-peer path (symmetric NAT on both sides, restrictive corporate firewall, etc.) and no TURN relay is configured, the system must fail with a clear, actionable error rather than a silent hang, and must suggest enabling the optional TURN relay (Section 12.4).

**FR-9 — Uninstall.** A single command (`npx tetherdesk destroy`) removes the local service, revokes all pairings, and deletes the Vercel project and its Marketplace add-ons, leaving no residual cloud resources or cost.

---

## 3. NON-FUNCTIONAL REQUIREMENTS

| Category | Requirement |
|---|---|
| Latency | Control input (keypress/tap → visible effect on screen video) should be under ~150 ms on a direct P2P path on typical home broadband, and the system must display measured round-trip latency to the user. |
| Availability of signaling | The Vercel-hosted signaling path must reconnect automatically within 3 seconds of any transient failure, with exponential backoff capped at 30 seconds, jittered to avoid thundering-herd reconnects. |
| Cost | Default configuration must operate within Vercel's free Hobby tier for a single-user, personal, non-commercial deployment, and within STUN/TURN providers' free tiers. |
| Portability | The agent must run on macOS (13+), Windows (10/11), and major Linux desktop environments (X11 and Wayland), acknowledging reduced input-injection support on some Wayland compositors (documented, not silently broken). |
| Security | See Section 16 in full; summarized here as: end-to-end encryption independent of transport, short-lived single-use pairing tokens, no plaintext secrets at rest, least-privilege backend. |
| Observability | Every session, pairing attempt, and error must be locally logged on the laptop and optionally (opt-in, off by default) reported as anonymized metrics — never screen content or input content — to help the user debug connectivity issues. |
| Accessibility | The PWA must meet WCAG 2.1 AA for its own chrome (not the streamed remote screen content, which is opaque pixels by nature). |
| Maintainability | TypeScript strict mode across backend, agent, and PWA; shared types via a common package; no `any` in production code paths. |

---

## 4. HIGH-LEVEL SYSTEM ARCHITECTURE

```
┌─────────────────────────┐                                   ┌──────────────────────────┐
│        LAPTOP           │                                   │          PHONE           │
│  ┌────────────────────┐ │                                   │  ┌─────────────────────┐  │
│  │ tetherdesk-agentd   │ │                                   │  │  TetherDesk PWA      │  │
│  │ - screen capture    │ │        1. Signaling only          │  │  - camera QR scan    │  │
│  │ - input injection   │◄┼──────(short WS / long-poll)───────┼─►│  - video render      │  │
│  │ - local CLI         │ │      via Vercel Functions         │  │  - touch → input      │  │
│  └─────────┬───────────┘ │      (SDP + ICE + pairing only)   │  └──────────┬────────────┘  │
│            │             │                                   │             │               │
│            │        2. Direct encrypted P2P data channel      │             │               │
│            └─────────────┼───────────(WebRTC / DTLS-SRTP)─────┼─────────────┘               │
│                          │      bypasses Vercel entirely      │                              │
└──────────────────────────┘         (falls back to TURN         └──────────────────────────────┘
                                       relay only if direct
                                       P2P is impossible)

                    ┌───────────────────────────────────────────┐
                    │              VERCEL DEPLOYMENT              │
                    │  Next.js App Router · Vercel Functions       │
                    │  ┌───────────────┐   ┌────────────────────┐ │
                    │  │ REST API       │   │ WS signaling (beta) │ │
                    │  │ (pairing, auth)│   │ + long-poll fallback│ │
                    │  └───────┬────────┘   └──────────┬──────────┘ │
                    │          │                        │            │
                    │  ┌───────▼────────────────────────▼─────────┐ │
                    │  │  Redis (Marketplace / Upstash)             │ │
                    │  │  ephemeral: sessions, mailbox, presence     │ │
                    │  └───────────────┬────────────────────────────┘ │
                    │  ┌───────────────▼────────────────────────────┐ │
                    │  │  Postgres (Marketplace / Neon) — optional    │ │
                    │  │  durable: device registry, audit log          │ │
                    │  └────────────────────────────────────────────┘ │
                    └───────────────────────────────────────────────┘
```

**Key architectural principle:** Vercel is a **matchmaker, not a pipe**. It helps the laptop and phone find each other and exchange just enough information (SDP offers/answers, ICE candidates, wrapped key material) to build a direct encrypted tunnel — then gets out of the way. All high-bandwidth, latency-sensitive traffic (screen video, input events) flows peer-to-peer, so Vercel's function-duration limits and per-invocation billing never touch the actual remote-control data.

---

## 5. TECHNOLOGY STACK

| Layer | Choice | Rationale |
|---|---|---|
| Backend framework | Next.js 15+ (App Router), deployed on Vercel | First-class Vercel support, API routes + native WebSocket beta in one deployable unit |
| Language | TypeScript everywhere (backend, agent, PWA), strict mode | Shared types package eliminates client/server drift |
| Signaling transport | Native Vercel Functions WebSocket (public beta) with automatic long-poll/HTTP fallback | Best available realtime primitive on Vercel today; fallback protects against beta instability |
| Ephemeral state store | Redis via Vercel Marketplace (Upstash), REST-based client (`@upstash/redis`) | Works from Edge and Node runtimes without TCP connection pooling issues; TTL-native, ideal for pairing tokens and mailboxes |
| Durable store (optional, Phase 4+) | Postgres via Vercel Marketplace (Neon), accessed with Drizzle ORM | Only needed once multi-device history/audit logging matters; not required for MVP |
| Peer transport | WebRTC (`RTCPeerConnection`), data channel for input/control, video track for screen | Built-in DTLS-SRTP encryption, mature NAT traversal, works in browsers (PWA) and Node (`@roamhq/wrtc` or equivalent maintained native binding) |
| NAT traversal | STUN: public free servers (e.g. Google's, or a self-hosted stateless STUN if desired). TURN: optional pluggable relay (Section 12.4) | STUN is free and stateless; TURN is the one component that may need an external provider, documented and opt-in |
| Screen capture (agent) | Platform-native capture (macOS: `ScreenCaptureKit` via native module; Windows: `Desktop Duplication API`; Linux: `PipeWire` on Wayland, `X11` `XGetImage`/`XShm` fallback) wrapped behind a common capture interface | Native APIs give far better performance/permission behavior than screenshotting loops |
| Input injection (agent) | Platform-native synthetic input (macOS: `CGEvent`; Windows: `SendInput`; Linux: `uinput`/`libei` on Wayland, `XTest` on X11) behind a common interface | Same rationale; also the layer where OS permission prompts are surfaced honestly |
| CLI/agent runtime | Node.js 20+ LTS with native modules where required, packaged via `pkg`/`node-single-executable` for distribution without requiring the end user to have Node installed post-setup | `npx` only needs Node for the *install* step; the long-running agent should not depend on the user keeping Node around |
| Mobile client | PWA: React + Vite, installable via Web App Manifest, camera access via `getUserMedia`, QR decode via `jsQR` or `barcode-detector` API where supported | Avoids app-store review, cost, and native build pipelines entirely; works cross-platform from one codebase |
| Crypto | WebCrypto API (browser + Node's `crypto.webcrypto`) for X25519 ECDH key exchange, HKDF for key derivation, AES-256-GCM for application-layer encryption on top of DTLS-SRTP | Standardized, audited primitives available natively on both ends, no custom crypto |
| QR generation | `qrcode` (Node) for terminal + web fallback rendering | Well-maintained, dependency-light |
| Monorepo tooling | Turborepo or Nx with pnpm workspaces | Shared types/crypto/protocol code across backend, agent, and PWA packages |
| Infra-as-code | Vercel REST API calls wrapped in a typed SDK module (`packages/vercel-provisioner`), not raw `vercel` CLI shell-outs, so the setup command's steps are individually testable | Testability and clearer error handling than parsing CLI stdout |
| CI/CD | GitHub Actions → Vercel Git integration for the backend; `npm publish` pipeline for the CLI/agent package | Standard, zero-cost for a personal project |

---

## 6. REPOSITORY / FOLDER STRUCTURE

```
tetherdesk/
├── apps/
│   ├── web/                      # Next.js backend + PWA host, deployed to Vercel
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── pairing/
│   │   │   │   │   ├── start/route.ts
│   │   │   │   │   ├── confirm/route.ts
│   │   │   │   │   └── revoke/route.ts
│   │   │   │   ├── signal/route.ts        # WebSocket upgrade handler
│   │   │   │   ├── signal/poll/route.ts   # long-poll fallback (mailbox drain)
│   │   │   │   ├── devices/route.ts
│   │   │   │   └── health/route.ts
│   │   │   ├── (pwa)/
│   │   │   │   ├── pair/[token]/page.tsx  # fallback pairing URL target
│   │   │   │   ├── control/page.tsx       # main remote-control screen
│   │   │   │   └── layout.tsx
│   │   │   └── manifest.webmanifest
│   │   ├── lib/
│   │   │   ├── redis.ts
│   │   │   ├── db.ts                      # Postgres/Drizzle client (Phase 4+)
│   │   │   ├── crypto.ts
│   │   │   └── rateLimit.ts
│   │   ├── public/
│   │   └── vercel.json
│   ├── agent/                    # Laptop background service
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── cli/                       # local `tetherdesk` subcommands
│   │   │   ├── capture/
│   │   │   │   ├── macos.ts
│   │   │   │   ├── windows.ts
│   │   │   │   └── linux.ts
│   │   │   ├── input/
│   │   │   │   ├── macos.ts
│   │   │   │   ├── windows.ts
│   │   │   │   └── linux.ts
│   │   │   ├── signaling/
│   │   │   │   ├── client.ts              # reconnecting WS/poll client
│   │   │   │   └── mailbox.ts
│   │   │   ├── webrtc/
│   │   │   │   └── peer.ts
│   │   │   ├── service/
│   │   │   │   ├── macosLaunchd.ts
│   │   │   │   ├── windowsService.ts
│   │   │   │   └── linuxSystemd.ts
│   │   │   └── qr/
│   │   │       └── render.ts
│   │   └── package.json
│   └── installer-cli/            # published as `tetherdesk` on npm, runs via `npx`
│       ├── src/
│       │   ├── index.ts
│       │   ├── steps/
│       │   │   ├── 01-prereq-check.ts
│       │   │   ├── 02-vercel-auth.ts
│       │   │   ├── 03-provision-project.ts
│       │   │   ├── 04-provision-redis.ts
│       │   │   ├── 05-set-env.ts
│       │   │   ├── 06-deploy.ts
│       │   │   ├── 07-install-agent-service.ts
│       │   │   ├── 08-permission-check.ts
│       │   │   └── 09-first-pairing.ts
│       │   └── vercel-provisioner/
│       └── package.json
├── packages/
│   ├── protocol/                 # shared TS types: signaling messages, session schema
│   ├── crypto/                   # shared ECDH/HKDF/AES helpers, isomorphic (Node + browser)
│   └── config/                   # shared eslint/tsconfig
├── docs/
│   ├── architecture/
│   ├── decisions/                 # ADRs for any spec ambiguity resolved during build
│   ├── runbooks/
│   └── api/
├── .github/workflows/
├── turbo.json
├── pnpm-workspace.yaml
└── README.md
```

---

## 7. BACKEND ARCHITECTURE (Vercel)

The backend is a Next.js App Router application with three responsibilities only: **identity/pairing, signaling relay, and device/session bookkeeping.** It must never touch screen or input content.

### 7.1 Runtime split

- **Node.js runtime** functions: WebSocket signaling endpoint, pairing endpoints that need the Node `crypto` module and Redis client.
- **Edge runtime** functions (optional optimization, Phase 3+): `health`, read-only `devices` list — lower cold-start latency, but not required for MVP.

### 7.2 Signaling endpoint responsibilities

`app/api/signal/route.ts` accepts a WebSocket upgrade (native Vercel Functions WS beta) scoped to a single pairing/session ID. It:

1. Validates the caller holds a valid session or pairing token (see Section 10).
2. Subscribes to that session's Redis mailbox (Section 9.1) and forwards any queued messages immediately.
3. Relays incoming WebRTC signaling payloads (SDP offer/answer, ICE candidates, wrapped key exchange blobs) to the mailbox for the other peer to consume, **without inspecting or logging their contents beyond size/type for abuse prevention.**
4. On disconnect (including forced disconnect at the function's `maxDuration`), simply closes — it holds no state itself; the client reconnects and resumes draining the same mailbox, which is why Redis (not Function memory) is the source of truth.

### 7.3 Long-poll fallback

`app/api/signal/poll/route.ts` implements the same mailbox-drain contract over plain HTTP (`GET` returns queued messages and immediately completes; `POST` enqueues a message). Both agent and PWA clients implement a `SignalingTransport` interface with two implementations (`WebSocketTransport`, `PollingTransport`) and automatically fall back to polling if the WS upgrade fails twice in a row, so a Vercel WS beta outage or an intermediary proxy that strips `Upgrade` headers never fully blocks pairing — it only adds latency.

### 7.4 Why no persistent in-memory state

Because Vercel Functions are not guaranteed to route reconnects to the same instance (see Section 1.3, item 1), **all cross-request state lives in Redis.** The backend code must be written as if every request could hit a cold, stateless instance — because it can.

---

## 8. FRONTEND (PWA) ARCHITECTURE

- Framework: React, built with Vite, served as static assets from the same Vercel deployment under `apps/web` (App Router serving a client-heavy route group).
- Routing: `/pair/[token]` — landing target encoded in the QR code; `/control` — the main remote-desktop view after a session is established.
- State management: React Query for server/session state (device list, pairing status); local component state / `useReducer` for the live WebRTC connection state machine (`idle → scanning → handshaking → connected → reconnecting → error`).
- Video rendering: an `<video>` element bound to the incoming WebRTC `MediaStream`; render loop otherwise left to the browser's native WebRTC pipeline for efficiency (do not re-render frames via `<canvas>` unless a feature — e.g., annotation overlays — specifically requires it).
- Input capture: pointer events (`pointerdown/move/up`) normalized to a virtual coordinate space matching the laptop's reported display resolution, sent over the WebRTC data channel as a compact binary-encoded (not JSON, to minimize latency/overhead) event schema defined in `packages/protocol`.
- Installability: full Web App Manifest with icons, `display: standalone`, and a service worker that caches the app shell only (never caches session data or credentials).
- Camera/QR: `getUserMedia` for camera stream, `BarcodeDetector` API where available with a `jsQR` canvas-based fallback for browsers lacking native support.

---

## 9. DATABASE SCHEMA

### 9.1 Redis (Marketplace / Upstash) — ephemeral, TTL-driven

All keys are namespaced `td:` and use short, explicit TTLs so an idle or abandoned session never lingers.

| Key pattern | Type | TTL | Purpose |
|---|---|---|---|
| `td:pair:{pairingToken}` | Hash | 90s | One-time pairing token → `{ laptopPubKey, sessionId, createdAt }`. Deleted on first successful consumption (single-use enforced via `GETDEL`/Lua CAS). |
| `td:session:{sessionId}` | Hash | 24h sliding (refreshed on activity) | `{ laptopDeviceId, phoneDeviceId, state, createdAt, lastActiveAt }` |
| `td:mailbox:{sessionId}:{recipient}` | List | 5 min per message (auto-trimmed) | Queued signaling payloads (SDP/ICE/wrapped key blobs) awaiting delivery to a reconnecting peer |
| `td:presence:{deviceId}` | String (`"online"`) | 30s, refreshed by heartbeat | Lets the other peer / UI show live/offline status without a persistent connection |
| `td:ratelimit:pair:{ip}` | String (counter) | 15 min | Pairing-attempt rate limiting (Section 16.6) |
| `td:revoked:{deviceId}` | String (`"1"`) | 30 days | Fast revocation check without a full DB round-trip; long-lived record lives in Postgres if enabled |

### 9.2 Postgres (Marketplace / Neon) — optional, durable (Phase 4+)

Not required for a single-user MVP (Redis alone covers FR-1 through FR-8), but specified here to satisfy FR-6 (multi-device management with history) and general audit requirements once the project matures beyond one phone.

```sql
CREATE TABLE devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL,                 -- single-user MVP: one fixed owner row
  device_type   TEXT NOT NULL CHECK (device_type IN ('laptop','phone')),
  display_name  TEXT NOT NULL,
  public_key    BYTEA NOT NULL,                -- long-term identity key, not the ephemeral pairing key
  paired_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE TABLE sessions_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laptop_device_id UUID NOT NULL REFERENCES devices(id),
  phone_device_id  UUID NOT NULL REFERENCES devices(id),
  started_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ,
  end_reason    TEXT,                          -- 'revoked' | 'timeout' | 'user_disconnect' | 'error'
  connection_mode TEXT                          -- 'direct_p2p' | 'turn_relay'
);

CREATE TABLE pairing_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     UUID REFERENCES devices(id),
  event         TEXT NOT NULL,                 -- 'initiated' | 'succeeded' | 'failed' | 'revoked'
  ip_hash       TEXT,                          -- hashed, not raw IP, to bound blast radius of DB exposure
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

No screen content, input content, or session encryption keys are ever written to Postgres or Redis — both stores hold only metadata necessary for rendezvous and bookkeeping.

---

## 10. AUTHENTICATION, AUTHORIZATION AND SECURE PAIRING

### 10.1 Identity model

- Each device (laptop agent, each paired phone) holds a **long-term X25519 identity keypair**, generated locally on first run and never transmitted in full — only the public key is ever sent to the backend or the other peer.
- The backend authenticates API calls using short-lived, session-scoped bearer tokens (JWT, signed with a key generated at deployment time and stored only in Vercel environment variables) issued after a successful pairing handshake — the backend does **not** hold a password or long-term secret for either device beyond their public keys.

### 10.2 Pairing handshake (the cryptographic core)

1. Laptop agent generates an **ephemeral** X25519 keypair for this pairing attempt (separate from its long-term identity key) and a random 128-bit pairing token.
2. Agent calls `POST /api/pairing/start` with its long-term public key and ephemeral public key; backend stores `td:pair:{pairingToken}` (Section 9.1) and returns the `sessionId`.
3. Agent renders a QR code encoding: `{ backendOrigin, pairingToken, sessionId, laptopEphemeralPubKey }` (compact CBOR or base64url-encoded JSON, kept under typical QR capacity for reliable scanning).
4. Phone scans the QR, generates its **own** ephemeral X25519 keypair, and performs ECDH with the laptop's ephemeral public key locally — the shared secret is derived on-device via HKDF and **never transmitted**.
5. Phone calls `POST /api/pairing/confirm` with the pairing token and its own ephemeral + long-term public keys. The backend performs a single-use `GETDEL` on `td:pair:{pairingToken}` — if the token is missing (already used or expired), confirmation fails closed.
6. Backend relays the phone's ephemeral public key to the laptop agent via the mailbox; the laptop derives the same shared secret independently.
7. Both sides now hold an identical symmetric session key that **the backend never had access to**. This key encrypts an application-layer AES-256-GCM envelope wrapped around the WebRTC data channel payloads — defense in depth on top of WebRTC's own DTLS-SRTP transport encryption, so that even a TURN relay (Section 12.4), which by design can see encrypted transport traffic metadata, still cannot read plaintext input or screen data.
8. Only after step 7 succeeds does the system proceed to standard WebRTC signaling (SDP/ICE) to establish the peer connection.

### 10.3 "Approved immediately" — implemented honestly

The product requirement is that a successful QR scan pairs immediately, with no separate manual approval tap. This is implemented as specified above: **the QR scan itself, combined with the cryptographic handshake, is the approval** — only someone who can see the laptop's screen (or the fallback pairing page) within the token's 90-second validity window can complete it. As a non-blocking defense-in-depth measure, the laptop shows a native OS notification ("TetherDesk: new device paired — [device fingerprint]") at the moment pairing completes, so the owner has passive visibility without any added friction or approval step.

### 10.4 Revocation

`DELETE /api/devices/{deviceId}` sets `td:revoked:{deviceId}` immediately (fast path) and, if Postgres is enabled, marks `devices.revoked_at`. All signaling and REST endpoints check the revocation flag before honoring a request. An active WebRTC session from a revoked device is torn down by the agent within one heartbeat interval (default 5s) by having the agent poll its own device's revocation status.

---

## 11. QR CODE PAIRING WORKFLOW (sequence)

```
Laptop agent                      Vercel backend                      Phone PWA
     │  1. POST /pairing/start          │                                  │
     ├─────────────────────────────────►│                                  │
     │  2. { sessionId, pairingToken }  │                                  │
     │◄─────────────────────────────────┤                                  │
     │  3. render QR (terminal + local  │                                  │
     │     fallback URL)                │                                  │
     │                                   │      4. user scans QR            │
     │                                   │◄─────────────────────────────────┤
     │                                   │  5. POST /pairing/confirm        │
     │                                   │◄─────────────────────────────────┤
     │  6. mailbox: phone ephemeral key │                                  │
     │◄─────────────────────────────────┤                                  │
     │  7. derive shared secret (ECDH)  │                                  │
     │                                   │           6b. mailbox: laptop    │
     │                                   │               ephemeral key      │
     │                                   ├──────────────────────────────────►│
     │                                   │           7b. derive shared      │
     │                                   │               secret (ECDH)      │
     │  8. WebRTC offer (encrypted      │                                  │
     │     signaling payload)           │                                  │
     ├─────────────────────────────────►│──────────────────────────────────►│
     │                                   │  9. WebRTC answer                │
     │◄──────────────────────────────────┤◄──────────────────────────────────┤
     │  10. ICE candidate exchange (both directions, several round-trips)   │
     │◄─────────────────────────────────►│◄─────────────────────────────────►│
     │  11. Direct P2P DTLS-SRTP connection established — Vercel is no      │
     │      longer in the data path from this point forward                 │
     │◄───────────────────────────────────────────────────────────────────►│
```

---

## 12. REMOTE COMMUNICATION ARCHITECTURE

### 12.1 Two distinct channels, two distinct trust models

1. **Signaling channel** (laptop ⇄ Vercel ⇄ phone): short-lived, reconnecting, carries only handshake and control-plane metadata. Trust model: backend is a semi-trusted relay — it can see *that* a pairing/session is happening and its metadata, but not session key material or remote-control content.
2. **Data channel** (laptop ⇄ phone, direct or TURN-relayed): long-lived for the duration of a control session, carries screen video and input events. Trust model: fully end-to-end encrypted (Section 10.2 step 7); a relay, if used, is untrusted and cannot decrypt.

### 12.2 WebRTC connection establishment

Standard ICE (Interactive Connectivity Establishment) with a Trickle-ICE pattern: candidates are gathered and exchanged incrementally over the signaling channel as they become available, rather than waiting to gather all candidates first, to minimize connection setup time.

### 12.3 STUN

Use one or more public STUN servers by default (e.g., a well-known public STUN endpoint) purely for reflexive address discovery — this is a stateless, single-packet exchange and carries no privacy/trust burden beyond revealing the device's public IP, which the device already exposes to any peer it connects to.

### 12.4 TURN — the one honest exception to "Vercel only"

TURN cannot run on Vercel (Section 1.3, item 2). Options, in order of recommendation:

1. **No TURN, direct-only (default).** Works for the majority of home/residential NAT configurations, especially when at least one side is on a permissive NAT or has UPnP/NAT-PMP available. This satisfies the budget constraint completely and should be the shipped default.
2. **Optional, user-opted-in free-tier TURN provider** (e.g., a provider offering a free monthly credit/bandwidth allotment). This is *not* infrastructure the user hosts or maintains — it's an API credential the setup wizard can optionally configure — but it is a third-party account, so it must be presented as an explicit opt-in during setup ("Some networks (hotel Wi-Fi, some corporate/campus networks, and some carrier-grade NAT on mobile data) block direct connections entirely. Want to add a free relay fallback for those cases? [y/N]"), never silently enabled.
3. Document in `docs/runbooks/nat-traversal.md` how the user can self-verify whether they need TURN (the PWA's connection-quality indicator reports `direct` vs `relayed` vs `failed`), so most users can confirm option 1 is sufficient for their actual networks before ever considering option 2.

### 12.5 Data channel message schema (`packages/protocol`)

Binary-encoded (not JSON) for latency-sensitive input events; JSON acceptable for infrequent control messages (clipboard sync, resolution change notice, heartbeat). Example (TypeScript source of truth, compiled to a compact binary layout):

```ts
type InputEvent =
  | { t: 'pointer'; x: number; y: number; buttons: number; ts: number }
  | { t: 'scroll'; dx: number; dy: number; ts: number }
  | { t: 'key'; code: string; down: boolean; ts: number }
  | { t: 'touch'; points: { id: number; x: number; y: number }[]; ts: number };

type ControlMessage =
  | { t: 'clipboard'; data: string }
  | { t: 'resolutionChanged'; width: number; height: number }
  | { t: 'heartbeat'; ts: number };
```

---

## 13. API DESIGN

All endpoints are under `/api`, JSON request/response unless noted, all state-changing endpoints require a valid session bearer token except the two pairing endpoints (which are protected by the single-use pairing token + rate limiting instead, since no session exists yet).

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/pairing/start` | Laptop agent begins a new pairing session, returns `sessionId` + `pairingToken` | Long-term device identity signature |
| POST | `/api/pairing/confirm` | Phone submits scanned pairing token + its ephemeral public key | Pairing token (single-use) |
| GET | `/api/devices` | List paired devices with status | Session bearer token |
| DELETE | `/api/devices/{id}` | Revoke a paired device | Session bearer token |
| GET/POST | `/api/signal/poll` | Long-poll fallback mailbox drain / enqueue | Session bearer token |
| WS | `/api/signal` | Native WebSocket signaling (primary path) | Session bearer token (passed at upgrade) |
| GET | `/api/health` | Deployment health check used by the installer | None (public, minimal info) |

Every response follows a consistent envelope:

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };
```

Error codes are enumerated in `packages/protocol/errors.ts` (e.g., `PAIRING_TOKEN_EXPIRED`, `PAIRING_TOKEN_ALREADY_USED`, `DEVICE_REVOKED`, `RATE_LIMITED`) so agent/PWA UI can react specifically rather than showing generic failures.

---

## 14. CLI ARCHITECTURE (laptop-side)

### 14.1 `installer-cli` (`npx tetherdesk <command>`)

Distinct from the long-running agent — this is the short-lived tool that sets everything up and then hands off to the agent.

```
tetherdesk init       # full guided first-time setup (FR-1)
tetherdesk pair       # start a new pairing session on an already-set-up install
tetherdesk status     # show agent + backend + paired-device status
tetherdesk devices    # list / revoke paired devices
tetherdesk logs        # tail local agent logs
tetherdesk destroy    # full teardown (FR-9)
```

`init` step sequence (mirrors `apps/installer-cli/src/steps/`):

1. **Prereq check** — Node version, OS support, disk space for the agent binary.
2. **Vercel auth** — check for existing token (`~/.tetherdesk/vercel-token`); if absent, run the device-authorization flow and clearly print: *"Opening your browser to authorize Vercel — this is the only manual step in setup."*
3. **Provision project** — create a new Vercel project via REST API, upload the pre-built `apps/web` output (or trigger a Git-less deployment via Vercel's deployment API using a local tarball), wait for build completion.
4. **Provision Redis** — attempt Marketplace API provisioning; on failure, print a single dashboard link and pause with clear resumption instructions, then continue automatically once detected as configured.
5. **Set environment variables** — generate a JWT signing secret and any other runtime secrets locally, push to the Vercel project via the Environment Variables API, redeploy if required for them to take effect.
6. **Deploy & health check** — poll `/api/health` until green.
7. **Install agent as a service** — write and register the appropriate OS service definition (Section 14.2), start it.
8. **Permission check** — probe screen-capture and input-injection permissions; if missing, print OS-specific instructions with a deep link to the relevant settings pane and wait for confirmation.
9. **First pairing** — start a pairing session and render the QR code, ending the `init` flow with a working pairing.

### 14.2 Background service registration

- **macOS:** a `launchd` `LaunchAgent` plist in `~/Library/LaunchAgents/`, `RunAtLoad` + `KeepAlive`, clearly labeled `com.tetherdesk.agent` (never disguised as a system daemon).
- **Windows:** a Windows Service (via `node-windows` or an equivalent maintained wrapper) named "TetherDesk Agent", visible in Services.msc and Task Manager under a clear name.
- **Linux:** a user-level `systemd` unit (`~/.config/systemd/user/tetherdesk-agent.service`) with `WantedBy=default.target`, visible via `systemctl --user status`.

In all cases the service must be trivially stoppable by the user through standard OS tooling, must log to a discoverable location (`~/.tetherdesk/logs/`), and must never attempt to hide its process name, evade Task Manager/Activity Monitor listing, or auto-restart after an explicit user-initiated stop.

### 14.3 Local agent CLI (talks to the running `agentd` over a local Unix socket / named pipe)

Mirrors the top-level commands but operates against the already-running agent rather than re-provisioning anything, so `tetherdesk status` etc. remain fast and offline-capable for local-only queries.

---

## 15. SECURITY REQUIREMENTS

This section is exhaustive by design — treat every line as a checklist item for code review and testing, not prose to skim.

1. **End-to-end encryption independent of transport** (Section 10.2) — the Vercel backend must be cryptographically incapable of decrypting session data, verified by a specific test that runs the pairing handshake with a mocked-malicious backend that logs everything it sees and asserts no plaintext session key ever appears in those logs.
2. **Single-use, short-TTL pairing tokens** (90s default, configurable down but not up beyond 5 minutes) enforced via atomic Redis `GETDEL`/Lua script to prevent race conditions where two confirmers could both succeed.
3. **Rate limiting** on `/api/pairing/confirm` (5 attempts per 15 minutes per IP, fail-closed on Redis unavailability for this endpoint specifically, since pairing is the highest-value target — unlike general read endpoints, which may fail-open per Section 15.9).
4. **No secrets in the QR code beyond what's needed for ECDH + rendezvous** — never encode a long-term private key, ever.
5. **Device revocation propagates within one heartbeat interval** (default 5s) and is checked on every signaling and data-plane control operation, not just at initial connection.
6. **TLS everywhere** — Vercel's default HTTPS for all backend traffic; WebRTC's mandatory DTLS-SRTP for peer traffic; no fallback to unencrypted transport under any configuration.
7. **Backend never logs screen content, input content, or session encryption key material** — structured logging must have an explicit allowlist of loggable fields (IDs, timestamps, event types, error codes), not a denylist, so new code can't accidentally log something sensitive by omission.
8. **Input validation** on every API route via a schema library (e.g., Zod), rejecting malformed payloads before they reach business logic.
9. **CORS locked to the deployment's own origin(s)**; no wildcard origins.
10. **CSRF protection** on state-changing endpoints (the bearer-token model largely mitigates this since tokens aren't cookies, but this must be explicitly verified, not assumed).
11. **Secrets management** — JWT signing keys and any provider credentials live only in Vercel environment variables (encrypted at rest by Vercel), never committed to the repository; `.env.example` documents required variables without real values.
12. **Dependency hygiene** — automated dependency vulnerability scanning (e.g., `npm audit`/Dependabot) wired into CI; native modules (screen capture, input injection) pinned to specific audited versions given their elevated OS privileges.
13. **OS permission prompts are never bypassed, auto-clicked, or suppressed** (Section 1.3, item 5) — this is both a security and a trust requirement.
14. **Service is never disguised** (Section 14.2) — no process-name spoofing, no hiding from Task Manager/Activity Monitor/`ps`, no persistence mechanism beyond standard OS service registration that the user explicitly installed and can remove through standard OS tooling.
15. **Audit trail** (once Postgres is enabled) for every pairing attempt (success and failure) and every session start/end, retained per the user's own configured retention window, with IP addresses stored only as salted hashes, never in plaintext, to limit blast radius if the database is ever exposed.
16. **Threat model documentation** — `docs/architecture/threat-model.md` must explicitly state what this system does *not* protect against (e.g., a compromised laptop OS, a physically stolen and unlocked phone with the PWA already paired, malware on either endpoint) so the user has accurate expectations; security theater is worse than an honest gap.

---

## 16. DEPLOYMENT STRATEGY

### 16.1 Vercel project configuration

- Single Vercel project hosting `apps/web` (Next.js). `vercel.json` should not need custom routing beyond what App Router provides by default.
- Environment variables (set via the installer, never manually): `JWT_SIGNING_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (injected automatically by the Marketplace integration), `NEXT_PUBLIC_APP_ORIGIN`, optional `TURN_*` credentials if the user opts in (Section 12.4).
- Function-level `maxDuration` configuration set explicitly per route rather than relying on plan defaults, so the signaling route's expected lifecycle is documented in code (`export const maxDuration = 60` with a comment explaining the reconnect design it assumes).

### 16.2 CI/CD

- GitHub Actions pipeline: on push to `main`, run lint + typecheck + unit tests + integration tests (Section 20) → Vercel's native Git integration handles the actual deployment (preview deployments per PR, production deployment on merge to `main`).
- `installer-cli` and `agent` packages are published to npm via a separate release workflow triggered on version tags, independent of the web app's deploy cadence.

### 16.3 Environments

- **Production:** the user's real, always-on deployment.
- **Preview:** automatic per-PR Vercel preview deployments, useful for testing signaling changes without touching the production Redis namespace (use a `preview:` key prefix override in preview environment variables to avoid cross-contaminating the production mailbox namespace).

### 16.4 Zero-downtime consideration

Because signaling connections are already designed to reconnect (Section 1.3), a Vercel redeploy (which recycles all Function instances) is a *non-event* for connected sessions rather than an outage — this should be explicitly covered by an integration test that deploys mid-session and asserts the session resumes.

---

## 17. ERROR HANDLING AND RESILIENCE

- **Reconnect state machine** (both agent and PWA): `connected → disconnected → reconnecting(attempt N, backoff) → connected | failed(after max attempts)`, surfaced in the UI/CLI at every state, never silently stuck.
- **Redis unavailability:** pairing and revocation checks fail closed (deny); presence/status reads fail open with a "status unknown" UI state rather than blocking usage.
- **Vercel WS beta instability:** automatic fallback to long-polling after 2 consecutive upgrade failures (Section 7.3), transparent to the user beyond a "using fallback connection (slightly higher latency)" indicator.
- **ICE failure (no viable path found):** explicit, human-readable error distinguishing "no TURN configured and direct connection failed" from other failure modes, with a direct link to `docs/runbooks/nat-traversal.md`.
- **OS permission revoked mid-session** (e.g., user revokes Screen Recording permission while a session is active): agent detects the capture failure, gracefully ends the session with a clear reason surfaced to the phone, rather than sending corrupt/empty frames.
- **Partial installer failure:** every step in Section 14.1 is idempotent and resumable — re-running `tetherdesk init` after a failure at step 5 must not re-attempt already-completed steps 1–4, verified by an installer integration test that kills the process at each step boundary and confirms clean resume.

---

## 18. LOGGING AND MONITORING

- **Structured JSON logging** on both backend (Vercel's built-in log drain, viewable via `vercel logs`) and agent (local rotating file logs in `~/.tetherdesk/logs/`), using the allowlisted-fields approach from Section 15.7.
- **Backend metrics** (Phase 4+, optional): pairing success/failure rate, signaling reconnect rate, p50/p95 handshake latency — exposed via a simple `/api/metrics` endpoint the user can view locally; no third-party analytics/APM service by default to preserve the zero-additional-cost constraint, but the interface should be pluggable (e.g., OpenTelemetry export) for a user who wants to wire up their own.
- **Agent local monitoring:** `tetherdesk status` surfaces current connection state, last successful heartbeat, active/paired device count, and recent error count without needing to grep logs.
- **No remote telemetry by default** — anonymized opt-in diagnostics (Section 3, Non-Functional Requirements table) must be a explicit, off-by-default setting with a clear description of exactly what is and isn't collected.

---

## 19. TESTING STRATEGY

| Level | Scope | Examples |
|---|---|---|
| Unit | Pure functions: crypto helpers, protocol encode/decode, Redis key builders | ECDH round-trip produces matching shared secret on both "sides" in a single test process; binary `InputEvent` encode/decode round-trips losslessly |
| Integration (backend) | API routes against a real (test-namespaced) Redis instance | Pairing token is single-use (second confirm attempt fails with `PAIRING_TOKEN_ALREADY_USED`); revocation propagates and is honored by subsequent signaling calls |
| Integration (agent ⇄ backend ⇄ PWA) | Full pairing handshake and WebRTC negotiation in a headless test harness (headless Chromium for the PWA side, a test double for the agent's native capture/input layers) | End-to-end pairing completes and a data channel opens within a target time budget; mid-session Vercel redeploy simulation confirms session resume (Section 16.4) |
| Security | Explicit adversarial tests | Malicious/log-everything mock backend cannot recover the session key (Section 15.1); replay of a used pairing token is rejected; rate limiter blocks the 6th pairing attempt within the window |
| Cross-platform | Capture/input modules on each OS | Run the platform-specific capture/input unit and smoke tests in CI matrix jobs (macOS, Windows, Ubuntu X11, Ubuntu Wayland runners) |
| Manual/exploratory | Real-world NAT scenarios | Documented test matrix in `docs/runbooks/nat-traversal.md` covering home NAT ⇄ home NAT, home NAT ⇄ mobile carrier NAT, both-symmetric-NAT-with-and-without-TURN |
| Installer resumability | Kill-and-resume at each `init` step boundary | Automated via a script that runs `init` in a disposable container/VM, injects a failure after each step, and asserts a second run completes successfully without redoing finished work |

Target coverage: ≥80% line coverage on `packages/protocol`, `packages/crypto`, and backend API route handlers; native capture/input modules are exempted from the numeric target (favor integration/manual smoke tests over unit-testing thin OS API wrappers) but must have at least one automated smoke test per platform in CI.

---

## 20. CODING STANDARDS AND BEST PRACTICES

- TypeScript strict mode (`strict: true`, `noUncheckedIndexedAccess: true`) across all packages; `any` is a lint error, not a warning.
- Shared `packages/config` ESLint + Prettier config enforced via CI, not just editor settings.
- Conventional Commits for commit messages; semantic-release or an equivalent for the publishable `installer-cli`/`agent` npm packages.
- No default exports for non-component modules (named exports only) for clearer refactoring and tree-shaking.
- All cryptographic code lives only in `packages/crypto` and is the single reviewed source of truth — no ad hoc `crypto` calls scattered elsewhere in the codebase.
- All platform-specific code (capture, input, service registration) sits behind a common interface (`ScreenCapture`, `InputInjector`, `ServiceInstaller`) with per-OS implementations selected at runtime — no `if (os === 'darwin')` branches scattered through business logic.
- Every public function in shared packages has a TSDoc comment; every non-obvious architectural decision gets a short ADR in `docs/decisions/`.
- Feature flags (simple env-var-driven, not a full flag service) for anything experimental (e.g., Edge runtime migration, TURN auto-provisioning) so Phase boundaries (Section 23) can ship incrementally without blocking on unfinished work.

---

## 21. DOCUMENTATION REQUIREMENTS

Deliverables under `/docs`, all written for a technically competent end user who is not necessarily a systems programmer:

- `README.md` — what this is, the one setup command, a screenshot/GIF of QR pairing, and the honest platform-limits summary from Section 1.3 in plain language.
- `docs/architecture/overview.md` — the diagram from Section 4 plus prose walkthrough.
- `docs/architecture/threat-model.md` — Section 15.16.
- `docs/runbooks/nat-traversal.md` — how to diagnose direct-vs-relay connectivity and when/how to opt into TURN.
- `docs/runbooks/troubleshooting.md` — common failure modes from Section 17 with user-facing remediation steps.
- `docs/api/` — generated OpenAPI-style reference for the REST endpoints in Section 13.
- `docs/decisions/ADR-*.md` — one per non-trivial judgment call made while implementing this spec.
- Inline `--help` output for every CLI command, kept in sync with the docs via a CI check that fails if they drift.

---

## 22. DEVELOPMENT PHASES AND MILESTONES

**Phase 0 — Foundations (repo, protocol, crypto).** Monorepo scaffold; `packages/protocol` and `packages/crypto` implemented and unit-tested in isolation, including a standalone script that proves the ECDH handshake produces matching keys between two independent processes. *Exit criteria:* crypto and protocol packages at ≥90% coverage, no backend or agent code yet required.

**Phase 1 — Backend skeleton + pairing (no WebRTC yet).** Next.js app with pairing endpoints, Redis integration, deployable to Vercel manually (no installer automation yet). A throwaway CLI script can complete a full pairing handshake against the deployed backend and print "shared secret matches." *Exit criteria:* FR-3's cryptographic core works end-to-end against a real Vercel deployment.

**Phase 2 — WebRTC data channel + minimal agent/PWA.** Real screen capture (one platform first, e.g. macOS) and real input injection, a minimal PWA that renders video and sends pointer events, direct P2P connection established via the Phase 1 signaling. *Exit criteria:* a human can watch their own laptop screen and move the mouse from a phone on a different network.

**Phase 3 — Cross-platform + resilience.** Windows and Linux capture/input implementations; reconnect/resume logic (Section 1.3 item 1, Section 17); long-poll fallback; graceful degradation and clear errors for NAT-traversal failure (FR-8). *Exit criteria:* the full resilience test suite (Section 19, integration row) passes, including the mid-session-redeploy resume test.

**Phase 4 — Installer automation (FR-1) + multi-device (FR-6) + optional Postgres audit trail.** The full `installer-cli` flow from Section 14.1; device list/revoke UI; Postgres schema from Section 9.2 wired in behind a feature flag. *Exit criteria:* a fresh machine with nothing installed can go from `npx tetherdesk init` to a working paired session with only the one disclosed Vercel OAuth click.

**Phase 5 — Hardening, docs, polish.** Full security checklist (Section 15) verified item-by-item with a named test or documented manual verification for each; full documentation set (Section 21); `tetherdesk destroy` teardown flow (FR-9); performance pass against the latency targets in Section 3. *Exit criteria:* this specification's every requirement has a corresponding passing test or explicit documented rationale for why it doesn't need one.

---

## 23. SCALABILITY CONSIDERATIONS

This is explicitly a **single-user, personal-scale** system, not a multi-tenant SaaS — say so directly rather than over-engineering for scale that isn't needed:

- Redis usage is trivially light (a handful of small keys per pairing/session) and stays well within any free tier at personal scale.
- If the user later wants to support genuinely many devices/users, the natural evolution path is: promote Postgres from optional to required, add a proper `owner_id`/multi-tenant boundary to every table, and move the signaling relay's rate limits from per-IP to per-account. This is explicitly out of scope for this specification but the schema in Section 9.2 is deliberately already shaped to make that migration additive rather than a rewrite.
- Vercel's own infrastructure scales the stateless parts (API routes, static PWA assets) automatically at no design cost to this project.

---

## 24. PERFORMANCE OPTIMIZATION

- Prefer Trickle ICE over full-gather-then-send to minimize connection setup latency (Section 12.2).
- Binary (not JSON) encoding for high-frequency input events (Section 12.5) to minimize per-message overhead at typical pointer-move frequencies.
- Screen video: prefer the platform's hardware-accelerated encode path where the chosen native capture library exposes one, and allow the user to choose a lower resolution/frame-rate profile for constrained mobile-data connections.
- Cold-start mitigation: keep the signaling Function's dependency graph small (avoid pulling in the full Postgres/Drizzle stack into a route that only needs Redis) so cold starts stay minimal, since signaling latency directly affects perceived pairing/reconnect speed.
- Redis reads on the hot path (mailbox drain, presence check) use Upstash's REST API with keep-alive connection reuse rather than opening a new connection per request.

---

## 25. FUTURE EXTENSIBILITY

Explicitly out of scope for this build but the architecture should not preclude:

- Multiple laptops paired to one phone (the schema and session model already support this; only the PWA's device-picker UI would need to be added).
- File transfer over the same encrypted data channel (the `ControlMessage` union in Section 12.5 is designed to be extended with a chunked `fileTransfer` variant without breaking existing message handling).
- A native (non-PWA) mobile app later, if App Store distribution becomes desirable — the protocol and crypto packages are already platform-agnostic TypeScript and the WebRTC/crypto logic could be ported to React Native without backend changes.
- Custom domain support (purely additive Vercel configuration, no architectural change).
- Migrating the signaling path off Vercel's WebSocket beta to a dedicated realtime provider if the beta's limitations prove too constraining at some point — the `SignalingTransport` interface (Section 7.3) is specifically designed to make that a swap-in change.

---

## 26. ACCEPTANCE CRITERIA / DEFINITION OF DONE

The project is complete when all of the following are true simultaneously:

- [ ] A user with a clean machine and a Vercel account can run one command and end up with a scannable QR code, with the only additional manual action being one browser OAuth click, clearly explained in the CLI output as it happens.
- [ ] Scanning that QR code from a phone on a different network, different NAT, and (verified via a VPN test) a different country than the laptop results in a working, controllable remote screen within the latency targets of Section 3.
- [ ] Killing and restarting the Wi-Fi on either device mid-session results in automatic reconnection without re-pairing.
- [ ] A redeploy of the Vercel backend mid-session does not end the session from the user's perspective.
- [ ] Revoking a device from the device list ends its active session within the documented heartbeat interval.
- [ ] The full security checklist in Section 15 is verified, item by item, with linked test evidence.
- [ ] `npx tetherdesk destroy` leaves no paid or ongoing-cost cloud resources behind.
- [ ] Every functional and non-functional requirement in Sections 2–3 traces to at least one passing automated test or an explicit, documented manual verification procedure.
- [ ] Documentation set in Section 21 is complete and matches the shipped CLI `--help` output exactly.

---

## 27. FINAL INSTRUCTION TO THE CODING AGENT

Build this in the phase order given in Section 22. Do not skip Phase 0's crypto proof-of-correctness to get to something visually impressive faster — a working handshake with no video is more valuable at that stage than a video stream with an unverified security model. At the end of every phase, produce a short status report mapping what was built back to the specific requirement IDs (FR-#, NFR row, or section number) it satisfies, and explicitly flag anything from this specification that had to be adjusted during implementation, with the reasoning captured as an ADR rather than a silent deviation.