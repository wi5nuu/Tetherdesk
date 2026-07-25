# NAT Traversal Runbook

## How to tell if you need a TURN relay

The TetherDesk PWA shows a connection indicator in the top-right corner of the control screen:

| Indicator | Meaning |
|---|---|
| `direct` (green) | Direct peer-to-peer connection. No relay involved. Best latency. |
| `relayed` (yellow) | Traffic is flowing through a TURN relay. Higher latency, but works on restrictive networks. |
| `failed` (red) | No path found. See the troubleshooting steps below. |

If you see `direct`, you don't need a TURN relay and can stop reading.

---

## Why direct connections fail

WebRTC uses ICE (Interactive Connectivity Establishment) to find a path between two devices. It tries in order:

1. **Host candidates** — direct LAN connection (works only if both devices are on the same network)
2. **Server-reflexive (STUN) candidates** — uses a STUN server to discover your public IP and NAT-mapped port, then tries to punch through both NATs simultaneously
3. **Relay (TURN) candidates** — if all else fails, route traffic through a relay

Direct connection fails when both devices are behind **symmetric NAT** — a NAT type that allocates a different port for each destination, making port prediction impossible. This is common on:

- Some hotel and airport Wi-Fi networks
- Some corporate/enterprise networks
- Some mobile carrier networks using CGNAT (Carrier-Grade NAT)
- Some older home routers with strict NAT policies

---

## Testing your NAT type

You can check whether your setup needs TURN **before** committing to a relay provider:

1. Attempt a pairing session. The PWA shows connection state as it progresses.
2. If ICE fails (red indicator or "Connection failed — no viable path found" error), your network combination requires TURN.
3. Try the same connection from a different network (e.g., phone on mobile data instead of Wi-Fi) — many combinations work fine without TURN.

---

## Configuring an optional TURN relay

TURN cannot run on Vercel (see architecture docs). Your options:

### Option A: Free-tier TURN provider

Several providers offer TURN with a free monthly bandwidth allowance sufficient for personal use:

1. During `npx tetherdesk init`, answer **Y** when prompted:
   > "Some networks block direct connections. Add a free TURN relay fallback? [y/N]"
2. The wizard will guide you through creating a free account and obtaining credentials.
3. Credentials are stored only in your Vercel environment variables — never in the repo.

To add TURN after initial setup:

```sh
npx tetherdesk config set turn-url    turns:your-provider.example.com:443?transport=tcp
npx tetherdesk config set turn-username   your-username
npx tetherdesk config set turn-credential your-credential
```

This updates the Vercel environment variables and triggers a redeployment.

### Option B: Self-hosted TURN (coturn)

If you have a VPS or home server with a public IP:

```sh
# Install coturn on Ubuntu/Debian
sudo apt install coturn

# Minimal /etc/turnserver.conf
realm=your-domain.example.com
server-name=your-domain.example.com
fingerprint
lt-cred-mech
user=tetherdesk:your-strong-password
cert=/etc/letsencrypt/live/your-domain/fullchain.pem
pkey=/etc/letsencrypt/live/your-domain/privkey.pem
```

Then set the credentials as in Option A above.

### Verifying TURN is working

After configuring TURN credentials:

1. Disable your laptop's Wi-Fi and use mobile hotspot (simulates a different NAT).
2. Start a new control session.
3. The connection indicator should show `relayed` rather than `failed`.

---

## Manual test matrix

Use this to verify your specific network combination before relying on TetherDesk for important use cases:

| Laptop network | Phone network | Expected result |
|---|---|---|
| Home broadband (residential NAT) | Home broadband (same network) | `direct` |
| Home broadband | Mobile carrier (4G/5G) | Usually `direct`; occasionally `relayed` on strict carriers |
| Home broadband | Hotel/airport Wi-Fi | Often `relayed` or `failed` without TURN |
| Home broadband | Corporate/campus Wi-Fi | Often `relayed` or `failed` without TURN |
| Both on mobile carrier | Both on mobile carrier | Depends on carrier; CGNAT may require TURN |
| Both behind symmetric NAT | Both behind symmetric NAT | Requires TURN |

---

## Graceful degradation without TURN

If direct connection fails and no TURN is configured, TetherDesk:

1. Shows a clear error: "Could not establish a direct connection. Some networks require a relay."
2. Links directly to this runbook.
3. Does **not** hang silently or show a spinning indicator indefinitely.
4. Keeps the signaling session alive so the connection succeeds immediately once TURN is configured, without re-scanning the QR code.

This behavior is required by FR-8 and is tested in the integration test suite.
