# Threat Model — TetherDesk

**Last updated:** 2026-07-25
**Scope:** TetherDesk v0.1 (Phases 0–4 implementation — full end-to-end system)

---

## What this document is

This document explains what TetherDesk protects against, and — equally importantly — what it **does not** protect against. Honest threat modeling is more useful than security theater. If a gap is documented here, it is a known, accepted risk; if a gap is not documented here and you discover one, please open an issue.

---

## Assets worth protecting

| Asset | Description |
|---|---|
| Screen content | Everything visible on the laptop's display during a remote session |
| Input events | Every keystroke, mouse movement, and touch gesture sent from the phone |
| Session key | The symmetric AES-256-GCM key derived during pairing; compromise allows decrypting all session traffic |
| Pairing token | The 90-second single-use token encoded in the QR code; possession allows initiating a pairing |
| Long-term identity key | The X25519 keypair generated locally on each device; used to prove device identity |

---

## Trust boundaries

```
[Laptop OS]  ←—local—→  [Agent process]  ←—DTLS-SRTP + AES-GCM—→  [Phone PWA]
                                │
                         [Vercel backend]  ←—untrusted relay—→
                                │
                         [Redis (Upstash)]
```

The Vercel backend and Redis are **semi-trusted**: they see that a session is happening and its metadata (session IDs, timestamps, message sizes) but cannot decrypt content.

---

## What TetherDesk protects against

### ✓ Network eavesdropper (passive)
All signaling traffic uses TLS (Vercel HTTPS). All peer-to-peer data uses WebRTC's mandatory DTLS-SRTP. On top of that, an application-layer AES-256-GCM envelope is applied so that even a TURN relay — which by design sits in the data path — cannot read plaintext session content.

### ✓ Compromised Vercel deployment
The backend never has access to the session key or screen/input content. A fully compromised Vercel instance can see pairing metadata (session IDs, device fingerprints, timestamps) and can disrupt or block sessions, but cannot read or replay session content.

### ✓ QR code photograph (within short window)
Pairing tokens are 128-bit random values with a 90-second TTL and are single-use (atomic `GETDEL`). A photo of the QR code is only useful within the validity window and can only be used once. Rate limiting (5 attempts per 15 minutes per IP) further limits brute-force guessing.

### ✓ Replay of a used pairing token
The token is consumed atomically on first use; subsequent `confirm` requests with the same token are rejected with `PAIRING_TOKEN_ALREADY_USED`.

### ✓ Session persistence after device revocation
Revocation is checked on every signaling operation and data-plane heartbeat. A revoked phone's active session is torn down within one heartbeat interval (default 5 seconds).

### ✓ Man-in-the-middle on the signaling channel
The ECDH key exchange is bound to the ephemeral public keys embedded in the QR code. A MITM on the signaling channel cannot substitute keys without breaking the QR-code binding.

---

## What TetherDesk does NOT protect against

### ✗ Compromised laptop OS
If an attacker has code execution or root/admin access on the laptop, they can read the screen directly, intercept the agent's memory, exfiltrate the session key, or inject input without going through TetherDesk. **This is out of scope by definition** — TetherDesk runs on the OS, not below it.

### ✗ Physically stolen, unlocked phone with the PWA already open
If someone steals your phone while the PWA has an active session, they can control your laptop. The mitigation is your phone's lock screen, not TetherDesk. You can revoke the pairing from the laptop using `tetherdesk devices`.

### ✗ Malware on the phone
Malware running in the same browser context as the PWA can read the session key from memory and decrypt or replay the session. Malware with OS-level access can screenshot the video stream directly.

### ✗ QR code visible to a bystander with a fast phone
Within the 90-second window, anyone who can cleanly photograph the QR code can attempt to pair. Mitigations: short TTL, single-use token, laptop shows a native notification when pairing completes so you know immediately. Mitigation gap: you cannot cancel an in-progress pairing that started before you noticed.

### ✗ Vercel credential leak (not session key, but session disruption)
If someone obtains your Vercel access token or project credentials, they cannot read session content (key never transits backend), but they could delete your deployment, read session metadata, or modify environment variables to replace the JWT signing key and issue forged tokens for new sessions. Mitigation: treat your Vercel credentials as high-value secrets; revoke and rotate if suspected compromised.

### ✗ Upstash/Redis credential leak (metadata exposure)
Redis holds session metadata, device IDs, and mailbox payloads (which contain encrypted key-exchange blobs and WebRTC signaling payloads). A Redis leak exposes: which devices are paired, when sessions occurred, and encrypted (but potentially analysable) signaling payloads. It does not expose screen content or plaintext session keys.

### ✗ TURN relay operator (if TURN is configured)
If you opt into a TURN relay, the relay operator can see the encrypted WebRTC traffic metadata (source/dest IPs, timing, packet sizes) and the DTLS-SRTP ciphertext. They cannot decrypt it due to the additional AES-256-GCM application layer. However, if you use a relay you do not control, you are trusting that operator not to log metadata. Use a relay you control, or accept that the operator can perform traffic analysis.

### ✗ Long-term identity key compromise
If the X25519 identity keypair stored in `~/.tetherdesk/` is exfiltrated, an attacker can impersonate your laptop in future pairing sessions. Mitigation: protect `~/.tetherdesk/` with appropriate file permissions (set by the agent at install time). Recovery: `tetherdesk destroy && tetherdesk init` generates a fresh keypair and revokes all existing pairings.

### ✗ Supply chain attack on npm packages
TetherDesk uses third-party npm packages. A compromised package in the dependency tree could exfiltrate keys or screen content. Mitigations: pinned dependency versions, `npm audit` in CI, Dependabot alerts. This does not fully eliminate supply chain risk.

---

## Design decisions with security rationale

| Decision | Rationale |
|---|---|
| Application-layer AES-256-GCM on top of DTLS-SRTP | Defense in depth: TURN relay operators, future protocol downgrades, and any WebRTC DTLS gap are all mitigated. Session key never leaves the devices. |
| Single-use pairing tokens via atomic `GETDEL` | Prevents race condition where two concurrent scanners could both succeed with the same token. |
| Rate limiting fails closed on Redis unavailability | Pairing is the highest-value attack target. Denying pairing during Redis outage is safer than allowing unlimited attempts. |
| Native OS permission prompts, never bypassed | Screen capture and input injection require explicit user consent. TetherDesk never attempts to pre-approve or suppress these prompts. |
| No secrets in the QR code beyond ECDH material | The QR encodes: backend URL, pairing token, session ID, laptop ephemeral public key. No long-term private keys, no session keys. |
| Session key derived locally on each device | The backend is structurally incapable of learning the session key. ECDH produces a shared secret that never transits a wire. |
