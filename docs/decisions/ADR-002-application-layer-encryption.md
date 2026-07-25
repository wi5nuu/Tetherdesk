# ADR-002: Application-Layer AES-256-GCM on Top of DTLS-SRTP

**Date:** 2026-07-24
**Status:** Accepted

---

## Context

WebRTC's mandatory DTLS-SRTP encrypts the data channel. A TURN relay by design sits in the data path and sees the DTLS ciphertext (but not the plaintext — DTLS is end-to-end). The question is: is DTLS-SRTP alone sufficient, or should TetherDesk add an application-layer encryption envelope?

## Decision

TetherDesk adds an application-layer AES-256-GCM envelope (using the session key derived during the ECDH pairing handshake) on top of WebRTC's DTLS-SRTP for all data channel messages (input events and control messages).

Screen video is **not** double-encrypted at the application layer — it flows as a native WebRTC `MediaStreamTrack` which is DTLS-SRTP encrypted only. This is an accepted asymmetry documented in the threat model.

## Rationale

- **Defense in depth:** If a future WebRTC implementation has a DTLS vulnerability, or the TURN relay operator is able to downgrade or inspect the session, the application-layer envelope still protects the plaintext.
- **TURN relay operator is untrusted:** The spec explicitly states that even a TURN relay operator should not be able to read session content. This is only achievable with application-layer encryption.
- **The session key is derived on-device:** The backend never has access to it. Adding this layer has no backend surface area.

## Consequences

- **Positive:** A compromised TURN relay sees only ciphertext at both transport and application layers for input/control data.
- **Negative:** Video track cannot use the same mechanism without a custom codec/container, so video is DTLS-SRTP only. This asymmetry is documented in the threat model.
- **Negative:** Small added latency from encrypt/decrypt on every data channel message. Benchmarked at <0.1ms on modern hardware — negligible.

## Alternatives considered

- **DTLS-SRTP only:** Simpler, but requires trusting the TURN relay operator completely.
- **Double-encrypt video too (via data channel instead of media track):** Eliminates the asymmetry but destroys hardware-accelerated video decode on the phone. Not worth the latency tradeoff.
