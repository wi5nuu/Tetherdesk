# Architecture Overview

## System diagram

```
┌─────────────────────────┐                              ┌──────────────────────────┐
│        LAPTOP           │                              │          PHONE           │
│  ┌────────────────────┐ │                              │  ┌─────────────────────┐ │
│  │ tetherdesk-agentd  │ │   1. Signaling only          │  │  TetherDesk PWA     │ │
│  │ - screen capture   │◄┼──(WS / long-poll via Vercel)─┼─►│  - camera QR scan   │ │
│  │ - input injection  │ │   SDP + ICE + pairing only   │  │  - video render     │ │
│  │ - local CLI        │ │                              │  │  - touch → input    │ │
│  └─────────┬──────────┘ │                              │  └──────────┬──────────┘ │
│            │            │  2. Direct encrypted P2P     │             │            │
│            └────────────┼──────(WebRTC/DTLS-SRTP)──────┼─────────────┘            │
│                         │    bypasses Vercel entirely  │                          │
└─────────────────────────┘                              └──────────────────────────┘

                  ┌──────────────────────────────────────────────┐
                  │             VERCEL DEPLOYMENT                 │
                  │  Next.js App Router · Vercel Functions        │
                  │  ┌────────────────┐  ┌──────────────────────┐ │
                  │  │ REST API        │  │ WS signaling (beta)  │ │
                  │  │ pairing, auth   │  │ + long-poll fallback │ │
                  │  └───────┬─────────┘  └──────────┬───────────┘ │
                  │          └─────────┬──────────────┘            │
                  │  ┌─────────────────▼────────────────────────┐  │
                  │  │  Redis (Upstash) — ephemeral              │  │
                  │  │  sessions · mailbox · presence · ratelimit│  │
                  │  └──────────────────────────────────────────┘  │
                  └──────────────────────────────────────────────┘
```

## Key architectural principle

**Vercel is a matchmaker, not a pipe.** It helps the laptop and phone find each other and exchange just enough information (SDP offers/answers, ICE candidates, wrapped key material) to build a direct encrypted tunnel — then gets out of the way. All high-bandwidth, latency-sensitive traffic (screen video, input events) flows peer-to-peer.

## Component responsibilities

### Backend (`apps/web`)

A Next.js App Router application with three responsibilities **only**:

1. **Pairing** — issue single-use tokens, store ephemeral public keys, relay the key exchange to both peers
2. **Signaling relay** — forward WebRTC SDP/ICE payloads between the agent and PWA via Redis mailboxes
3. **Session bookkeeping** — device list, revocation, presence

It never touches screen content or input events. It cannot decrypt session data even if fully compromised.

### Agent (`apps/agent`)

A long-running Node.js process on the laptop:

- Maintains a reconnecting signaling connection to the backend
- Captures the screen via platform-native APIs (ScreenCaptureKit / Desktop Duplication / PipeWire/X11)
- Injects keyboard/mouse/touch events via platform-native APIs (CGEvent / SendInput / XTest/libei)
- Manages the WebRTC peer connection (offer/answer, ICE, data channel)
- Exposes a local CLI via a Unix socket / named pipe

### PWA (`apps/web/app/(pwa)`)

A React app served from the same Vercel deployment:

- `/pair/[token]` — lands here after QR scan; completes the ECDH handshake
- `/control` — renders the incoming WebRTC video stream; captures touch input and sends it over the data channel

### Packages

| Package | Purpose |
|---|---|
| `@tetherdesk/protocol` | Shared TypeScript types: signaling messages, input events, control messages, error codes |
| `@tetherdesk/crypto` | Isomorphic X25519/HKDF/AES-256-GCM helpers (Node + browser WebCrypto) |
| `@tetherdesk/config` | Shared TypeScript and ESLint config |

## Data flow: pairing

```
1. Agent  →  POST /api/pairing/start  →  Backend stores td:pair:{token}  →  Agent renders QR
2. Phone scans QR  →  POST /api/pairing/confirm  →  Backend does GETDEL on token (single-use)
3. Backend puts phone's ephemeral pubkey in td:mailbox:{sessionId}:laptop
4. Agent polls/receives mailbox  →  derives shared secret via ECDH locally
5. Phone derives same shared secret locally  →  neither secret ever transits the network
6. WebRTC signaling (SDP/ICE) exchanged through mailbox  →  direct P2P tunnel established
```

## Data flow: control session

```
Phone touch event
  → binary-encoded InputEvent (packages/protocol)
  → AES-256-GCM encrypted (application layer, on top of DTLS-SRTP)
  → WebRTC data channel
  → Agent decrypts and injects via OS input API
  → Frame captured by OS screen capture API
  → Encoded as video frame
  → WebRTC video track
  → Phone renders in <video> element
```

## Redis key schema

| Key | Type | TTL | Purpose |
|---|---|---|---|
| `td:pair:{token}` | Hash | 90s | Single-use pairing token |
| `td:session:{id}` | Hash | 24h sliding | Session state |
| `td:mailbox:{id}:{recipient}` | List | 5min per message | Signaling queue |
| `td:presence:{deviceId}` | String | 30s | Live/offline status |
| `td:ratelimit:pair:{ip}` | String | 15min | Pairing rate limit counter |
| `td:revoked:{deviceId}` | String | 30 days | Fast revocation lookup |

## Reconnect design

Vercel Functions have a maximum lifetime (60s on Hobby). Rather than treating this as a limitation, the system is designed around it:

- All session state lives in Redis, not Function memory
- Both the agent and PWA treat the signaling connection as short-lived and auto-reconnecting
- A function recycle is invisible to the user — both sides reconnect and drain the same Redis mailbox

This is documented in `ADR-001-websocket-http-longpoll-fallback.md`.
