# TetherDesk

Zero-infrastructure remote laptop control from your phone, from anywhere.

## What is TetherDesk?

TetherDesk lets you view and control your laptop screen from your phone across any network — different Wi-Fi, different carrier, different country. No server to maintain, no monthly subscription, no app store installation required.

**The core idea:** Your laptop runs a background agent that captures the screen and accepts input. Your phone runs a Progressive Web App in the browser that displays the stream and sends touch/click events back. A tiny backend on Vercel acts as the matchmaker during pairing, then steps aside — all actual screen streaming happens peer-to-peer via WebRTC.

## Quick Start

```bash
npx tetherdesk start
```

This command:
1. Starts the local agent on your laptop
2. Generates a QR code in the terminal
3. Creates a pairing session with 90-second expiry
4. Waits for your phone to connect

On your phone:
- Scan the QR code with any camera app, or
- Open the URL shown in the terminal, or
- Visit the access page and enter the one-time key (TD-XXXXXX)

When prompted on your laptop, click **Allow**. Your phone now displays your laptop screen. Tap to click, swipe to scroll, pinch to zoom.

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

**1. One-Time Pairing Key (TD-XXXXXX)**
- Generated when you run `npx tetherdesk start`
- Displayed alongside the QR code in terminal
- Valid for 90 seconds
- Used for quick, temporary connections
- Example: `TD-A3F2K9`

**2. Persistent API Key (sk-xxx...)**
- Generated from the dashboard at `/dashboard`
- Format: `sk-` prefix + 32 hex characters
- Stored in Redis until explicitly revoked
- Used for repeat access without scanning QR every time
- Example: `sk-a1b2c3d4e5f6...`

Both key types trigger the same ECDH handshake, but persistent keys skip the ephemeral keypair generation step.

## Requirements

| Component | Requirement |
|-----------|-------------|
| **Laptop OS** | Windows 10/11, macOS 13+, Linux (X11/Wayland) |
| **Phone** | Any modern browser — iOS Safari 16+, Android Chrome 105+ |
| **Node.js** | 20+ (only needed to run the agent; the agent itself is bundled) |
| **Network** | Internet connection on both devices (can be different networks) |
| **Cost** | $0 — runs on Vercel Hobby (free tier) + Upstash Redis (free tier) |

## Installation

### Global Install (Recommended)

```bash
npm install -g tetherdesk
```

Then run:

```bash
tetherdesk start
```

### One-Time Use (No Install)

```bash
npx tetherdesk start
```

This downloads and runs the latest version without installing globally.

## Commands

```bash
tetherdesk start              # Start agent, show QR code
tetherdesk status             # Show agent status
tetherdesk logs               # Show agent logs (upcoming)
tetherdesk config             # Show config file location
tetherdesk devices            # List paired devices (upcoming)
tetherdesk destroy            # Stop agent and delete config
```

## Configuration

Agent stores config at `~/.tetherdesk/config.json`:

```json
{
  "backendOrigin": "https://your-vercel-deployment.vercel.app",
  "agentSecret": "your-secret-key",
  "turnServers": [...]
}
```

**Do not share this file** — it contains credentials for your private backend.

## Dashboard Features

Visit `/dashboard` on your backend URL to access:

- **Live QR Code** — Refreshed every 90 seconds automatically
- **One-Time Key Display** — The `TD-XXXXXX` key paired with current QR
- **Approval Modal** — Popup when a phone attempts to connect
- **Activity Log** — Real-time stream of pairing/WebRTC events via Server-Sent Events
- **API Key Management** — Generate, copy, and revoke persistent API keys
- **Agent Status** — Shows whether your local agent is running and connected
- **Auto-Approve Toggle** — Automatically approve pairing requests (use with caution)

## Phone Client (PWA)

The phone client runs at `/control` and provides:

- **Touchscreen Controls** — Tap = mouse click, swipe = mouse drag, pinch = zoom
- **Virtual Keyboard** — On-screen keyboard for text input
- **Landscape/Portrait** — Responsive layout adapts to phone orientation
- **Add to Home Screen** — Install as PWA for full-screen experience
- **Background Reconnect** — Automatically reconnects if connection drops

## Backend Infrastructure

TetherDesk backend runs on:
- **Vercel** — Serverless Next.js deployment (Hobby plan = free)
- **Upstash Redis** — Serverless Redis for pairing data (free tier = 10,000 commands/day)
- **Cloudflare** — STUN/TURN servers for WebRTC NAT traversal (free)

**Why Vercel + Redis?**
- Vercel Functions have HTTP-only endpoints (no WebSocket support), so the agent uses long-polling for signaling
- Redis stores pairing tokens with automatic expiry (TTL)
- Total cost: $0/month on free tiers for personal use

## WebRTC Signaling

Since Vercel doesn't support WebSocket, TetherDesk uses **long-polling** for signaling:

```
Agent → GET /api/signal/poll?sessionId=xxx (waits 25 seconds)
       ← ICE candidate from phone

Phone → POST /api/signal (sends ICE candidate)
       → Agent receives via long-poll response
```

This adds ~1-2 seconds latency during initial connection, but once WebRTC P2P is established, signaling is no longer needed.

## Platform Limitations

These are not bugs — they are honest constraints:

- **Signaling reconnects every ~30 seconds** — Vercel Functions have maximum lifetime. The agent and phone reconnect automatically and silently.
- **Direct P2P works for most networks** — If both devices are behind symmetric NAT (rare in home/mobile networks), direct connection may fail. Enable TURN relay if needed.
- **No persistent sessions across agent restarts** — Pairing keys expire when agent stops. Persistent API keys survive restarts.

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
   tetherdesk config
   # Edit backendOrigin to https://your-deployment.vercel.app
   ```

## Troubleshooting

### Agent won't start
- Check Node.js version: `node --version` (must be 20+)
- Check if port 3000 is already in use
- Check logs: `tetherdesk logs` (upcoming)

### QR code won't scan
- Make sure QR is not expired (90 seconds)
- Try entering the `TD-XXXXXX` key manually at `/access`
- Check if phone and laptop have internet connection

### Connection fails after pairing
- Check if both devices can reach the Vercel backend
- Try enabling TURN relay (upcoming feature)
- Check browser console for WebRTC errors

### Screen is black on phone
- Make sure laptop agent is running (`tetherdesk status`)
- Check if screen capture permission is granted (macOS/Windows)
- Try restarting the agent

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

**Threat Model:**
- **Vercel backend compromise:** Attacker can see pairing tokens and ephemeral public keys, but cannot derive session keys or decrypt traffic
- **Redis compromise:** Same as Vercel — public keys are useless without private keys
- **MITM on pairing:** Attacker can intercept QR code, but cannot impersonate laptop without approval modal
- **MITM on WebRTC:** WebRTC uses DTLS-SRTP, which is resistant to MITM if STUN/TURN servers are trusted

## Contributing

TetherDesk is open source under MIT license. Contributions welcome:
- Bug reports: https://github.com/wi5nuu/Tetherdesk/issues
- Feature requests: https://github.com/wi5nuu/Tetherdesk/discussions
- Pull requests: https://github.com/wi5nuu/Tetherdesk/pulls

## Roadmap

Planned features (not yet implemented):
- [ ] Structured logging with log levels
- [ ] `tetherdesk logs --tail` command
- [ ] Semantic versioning + auto-update check
- [ ] TURN relay configuration UI
- [ ] Device management (revoke paired devices)
- [ ] Session recording/playback
- [ ] Multi-user approval (team access)

## License

MIT License — see LICENSE file for details.

## Acknowledgments

Built with:
- **Next.js** — React framework for the web backend
- **WebRTC** — Peer-to-peer video streaming
- **Upstash Redis** — Serverless Redis for pairing data
- **Cloudflare** — TURN/STUN servers
- **X25519/AES-GCM** — Cryptographic primitives

Special thanks to the open-source community for the libraries that made this possible.
