# TetherDesk

Zero-infrastructure remote laptop control — control your laptop from your phone, from anywhere.

## What it is

TetherDesk lets you view and control your laptop screen from your phone across any network — different Wi-Fi, different carrier, different country. Setup takes one command. There is no server to maintain, no monthly bill beyond what you already pay for internet, and no app store installation.

**How it works in one sentence:** your laptop runs a background agent that captures its screen and accepts input; your phone runs a browser app that receives the screen and sends your taps as mouse/keyboard events; a tiny Vercel deployment acts as a matchmaker to help them find each other, then gets out of the way.

## One-command setup

```sh
npx tetherdesk init
```

This will:

1. Check prerequisites (Node 20+, supported OS)
2. Log you into Vercel — **this is the only manual step**, one browser click
3. Create and deploy your private backend (Vercel + Upstash Redis)
4. Install the background agent as an OS service
5. Check OS permissions (screen recording, accessibility)
6. Show a QR code — scan it with your phone to pair

Total time from zero to paired: under 3 minutes on a typical home internet connection.

## Requirements

| | |
|---|---|
| **Laptop OS** | macOS 13+, Windows 10/11, Linux (X11 or Wayland) |
| **Phone** | Any modern browser — iOS Safari 16+, Android Chrome 105+ |
| **Node.js** | 20+ (only needed to run `npx tetherdesk init`; the agent itself is self-contained) |
| **Cost** | Free — runs on Vercel Hobby tier + Upstash free tier |

## Platform limits (read before filing bugs)

These are not bugs — they are honest constraints of the platform:

- **Signaling reconnects, not one eternal socket.** Vercel Functions have a maximum lifetime. The agent and phone app both reconnect automatically and silently when this happens. A session survives indefinitely as long as the agent keeps running.
- **Direct P2P works for most home networks.** If both your laptop and phone are behind symmetric NAT (common in some corporate or campus networks), direct connection may fail. The app will tell you clearly and suggest enabling an optional TURN relay. See `docs/runbooks/nat-traversal.md`.
- **One browser click for Vercel auth.** The device-authorization flow is unavoidable on first setup. Every subsequent step is scripted.

## Usage

```sh
npx tetherdesk init        # First-time setup
npx tetherdesk pair        # Start a new pairing session
npx tetherdesk status      # Show agent + connection status
npx tetherdesk devices     # List and revoke paired devices
npx tetherdesk logs        # Tail local agent logs
npx tetherdesk destroy     # Remove everything — no cloud resources left behind
```

## Architecture

See `docs/architecture/overview.md` for the full diagram and walkthrough.

The short version:

```
Phone PWA  ←—signaling only—→  Vercel (matchmaker)  ←—signaling only—→  Laptop Agent
     ↑                                                                         ↑
     └──────────────────── direct encrypted P2P (WebRTC) ────────────────────┘
                              Vercel not in this path
```

## Security

- End-to-end encrypted: the Vercel backend never has access to your session key or screen content
- Single-use, 90-second pairing tokens
- Pairing requires physical access to your laptop screen (or the QR code it displays)
- Full threat model: `docs/architecture/threat-model.md`

## Uninstall

```sh
npx tetherdesk destroy --yes
```

Removes the local service, revokes all pairings, deletes the Vercel project and Redis instance. No residual cloud resources or charges.
