# TetherDesk

Zero-infrastructure remote laptop control from your phone, from anywhere.

## What is TetherDesk?

TetherDesk lets you view and control your laptop screen from your phone across any network — different Wi-Fi, different carrier, different country. No server to maintain, no monthly subscription, no app store installation required.

**The core idea:** Your laptop runs a background agent that captures the screen and accepts input. Your phone runs a Progressive Web App in the browser that displays the stream and sends touch/click events back. A tiny backend on Vercel acts as the matchmaker during pairing, then steps aside — all actual screen streaming happens peer-to-peer via WebRTC.

## Quick Start

```bash
npx tetherdesk
```

This single command:
1. Starts the local agent on your laptop
2. Shows a **QR code** in the terminal
3. Displays an **access key** (`TD-XXXXXX`) in a box
4. Creates a pairing session with 90-second expiry

**On your phone:**
- Scan the QR code from the terminal, **or**
- Open `https://tetherdesk-five.vercel.app/access` and enter the `TD-XXXXXX` key, **or**
- Open the dashboard URL shown in the terminal

When prompted on your laptop, click **Allow**. Your phone now displays your laptop screen with a full control toolbar — zoom, keyboard input, modifier keys (Ctrl/Alt/Win), and special keys (Esc/Tab/Enter).

## How It Actually Works

### Architecture Overview

```
┌─────────────┐                                    ┌─────────────┐
│   Phone     │                                    │   Laptop    │
│   Browser   │                                    │   Agent     │
│   (PWA)     │                                    │  (Node.js)  │
└──────┬──────┘                                    └──────┬──────┘
       │                                                  │
       │  1. Pairing request (ephemeral pubkey)         │
       ├────────────────────────────►                   │
       │                             │                   │
       │                    ┌────────▼────────┐         │
       │                    │  Vercel Backend │         │
       │                    │   + Redis       │         │
       │                    │  (Matchmaker)   │         │
       │                    └────────┬────────┘         │
       │                             │                   │
       │         ◄────────────────────┤                  │
       │  2. Laptop pubkey + approval                   │
       │                                                  │
       │  3. ECDH → derive session key locally           │
       │     (never transmitted)                          │
       │                                                  │
       │  4. WebRTC signaling (ICE candidates)          │
       ├─────────────────────────────┼──────────────────►│
       │                                                  │
       │  5. Direct P2P connection established           │
       │     (STUN/TURN via Cloudflare)                  │
       │◄────────────── encrypted stream ───────────────►│
       │                                                  │
       │  Vercel backend NO LONGER involved              │
       │  in this data path                              │
       │                                                  │
```

### Security Model

**Pairing Flow:**
1. Laptop generates ephemeral X25519 keypair (one-time use)
2. Laptop sends public key + pairing token to Redis (90-second TTL)
3. QR code encodes: `{backendOrigin, pairingToken, sessionId, laptopEphemeralPubKey}`
4. Phone scans QR, extracts payload
5. Phone generates its own ephemeral X25519 keypair
6. Phone computes shared secret via ECDH: `ECDH(phoneSK, laptopPK)`
7. Shared secret → HKDF with sessionId as salt → 256-bit AES-GCM key
8. Phone sends its public key to Redis
9. Laptop polls Redis, retrieves phone's public key
10. Laptop computes same shared secret: `ECDH(laptopSK, phonePK)`
11. Both sides now have identical session key, **never transmitted over network**

**Why This Is Secure:**
- Session keys are derived using Elliptic Curve Diffie-Hellman (ECDH), meaning only the two devices can compute the shared secret
- Vercel backend only sees ephemeral public keys (which are useless without the private keys)
- Even if Redis is compromised, attacker cannot decrypt the session without both private keys
- QR codes expire in 90 seconds to prevent replay attacks
- WebRTC media is encrypted with DTLS-SRTP (standard WebRTC encryption)

### Key Types

TetherDesk supports two access methods:

**1. One-Time Pairing Key (`TD-XXXXXX`)**
- Generated when you run `npx tetherdesk`
- Displayed alongside the QR code in terminal
- Valid for 90 seconds
- Single-use — consumed after connection
- Example: `TD-IU5RqiQh9ZAz0fuQafWV7Q`

**2. Persistent API Key (`sk-xxx...`)**
- Generated from the dashboard
- Format: `sk-` prefix + 32 hex characters
- Never expires — use until revoked
- Stored in browser via "Remember this key"
- Example: `sk-a1b2c3d4e5f67890abcdef1234567890`

Both key types trigger the same ECDH handshake.

## Requirements

| Component | Requirement |
|-----------|-------------|
| **Laptop OS** | Windows 10/11, macOS 12+, Linux (x64, arm64) |
| **Phone** | Any modern browser — iOS Safari 16+, Android Chrome 105+ |
| **Node.js** | 20+ |
| **npm/pnpm** | npm 10+ or pnpm 9+ |
| **Network** | Internet connection on both devices (can be different networks) |
| **Cost** | $0 — runs on Vercel Hobby (free tier) + Upstash Redis (free tier) |

No account, no credit card, no port forwarding. TetherDesk uses Cloudflare Tunnel for outbound-only connections.

## Installation

### Global Install (Recommended)

```bash
npm install -g tetherdesk
```

Then run:

```bash
tetherdesk
```

### One-Time Use (No Install)

```bash
npx tetherdesk
```

This downloads and runs the latest version without installing globally. The CLI is bundled with all dependencies.

## CLI Commands

| Command | Description |
|---------|-------------|
| `tetherdesk` | Start agent, show QR code + access key |
| `tetherdesk config [key] [value]` | View/set configuration |
| `tetherdesk pair` | Generate fresh access key (agent must be running) |
| `tetherdesk status` | Check if agent is running |
| `tetherdesk stop` | Stop agent and close all connections |
| `tetherdesk logs` | Tail agent log file in real-time |

## Configuration

Agent stores config at `~/.tetherdesk/config.json`:

```json
{
  "backendOrigin": "https://tetherdesk-five.vercel.app",
  "agentSecret": "your-secret-key"
}
```

**Do not share this file** — it contains credentials for your private backend.

## Documentation

Full bilingual documentation (English + Indonesian) is available at:

- [https://tetherdesk-five.vercel.app/docs](https://tetherdesk-five.vercel.app/docs)

Covers: Quick Start, Installation, Access Keys, Pairing Flow, Dashboard Guide, Troubleshooting, CLI Reference, and FAQ.

## Phone Client (PWA)

The phone client runs at `/control` and provides:

- **Live Screen Stream** — Real-time laptop screen via WebRTC
- **Touchscreen Controls** — Tap = mouse click, swipe = mouse drag
- **Zoom Toggle** — Pinch-to-zoom or button toggle
- **Keyboard Input** — On-screen text input field
- **Modifier Keys** — Sticky Ctrl, Alt, Win keys
- **Special Keys** — Esc, Tab, Enter, Backspace, Delete
- **Landscape/Portrait** — Responsive layout adapts to phone orientation
- **Auto-Reconnect** — SSE-based reconnection on drop

## Backend Infrastructure

TetherDesk backend runs on:
- **Vercel** — Serverless Next.js deployment (Hobby plan = free)
- **Upstash Redis** — Serverless Redis for pairing data (free tier = 10,000 commands/day)
- **Cloudflare** — STUN/TURN servers for WebRTC NAT traversal (free)

**Why Vercel + Redis?**
- Vercel Functions have HTTP-only endpoints (no WebSocket support), so the agent uses long-polling for signaling
- Redis stores pairing tokens with automatic expiry (TTL)
- Total cost: $0/month on free tiers for personal use

## Deployment (Self-Hosted Backend)

To deploy your own TetherDesk backend:

1. Fork the repository
2. Deploy to Vercel:
   ```bash
   vercel --prod
   ```
3. Create Upstash Redis database at https://console.upstash.com
4. Set environment variables in Vercel dashboard:
   ```
   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN=xxx
   JWT_SIGNING_SECRET=your-random-secret-32-chars
   AGENT_SECRET=your-random-secret-32-chars
   TETHERDESK_KEY_NAMESPACE=prod
   ```
5. Update agent config to point to your Vercel URL:
   ```bash
   tetherdesk config backendOrigin https://your-deployment.vercel.app
   ```

## FAQ

**Is my data encrypted?**
Yes. X25519 ECDH + HKDF key agreement, DTLS-SRTP (AES-GCM 256) for WebRTC.

**Do I need an account?**
No. No account, registration, or personal info needed.

**Do I need to open ports?**
No. Cloudflare Tunnel creates an outbound-only connection. Works behind NAT, firewalls, and CGNAT.

**Works on iPhone and Android?**
Yes. Browser-based PWA. Safari (iOS) and Chrome (Android).

**Is there a mobile app?**
PWA only. Add to Home Screen on Android (Chrome) or iOS (Safari Share).

**Is TetherDesk open source?**
Yes. MIT license on [GitHub](https://github.com/wi5nuu/Tetherdesk).

## Security Considerations

**What TetherDesk Does:**
- End-to-end encryption via ECDH + AES-GCM
- Ephemeral keys (never reused)
- 90-second QR expiry
- Approval modal before connection

**What TetherDesk Does NOT Do:**
- TetherDesk does not protect against physical access — if someone has your phone unlocked, they can control your laptop
- TetherDesk does not prevent screen recording on the phone
- TetherDesk does not log or audit control actions (yet)

## Contributing

TetherDesk is open source under MIT license. Contributions welcome:
- Bug reports: https://github.com/wi5nuu/Tetherdesk/issues
- Feature requests: https://github.com/wi5nuu/Tetherdesk/discussions
- Pull requests: https://github.com/wi5nuu/Tetherdesk/pulls

## License

MIT License — see LICENSE file for details.

## Acknowledgments

Built with:
- **Next.js** — React framework for the web backend
- **WebRTC** — Peer-to-peer video streaming
- **Upstash Redis** — Serverless Redis for pairing data
- **Cloudflare** — TURN/STUN servers
- **X25519/AES-GCM** — Cryptographic primitives
- **@roamhq/wrtc** — WebRTC native bindings for Node.js agent
