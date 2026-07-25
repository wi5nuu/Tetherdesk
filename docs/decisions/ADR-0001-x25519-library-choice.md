# ADR-0001: Use `@noble/curves` for X25519 ECDH instead of native WebCrypto

**Status:** Accepted
**Context:** Phase 0 (`packages/crypto`)

## Context

Section 5 of the spec (Technology Stack) specifies: "WebCrypto API (browser + Node's
`crypto.webcrypto`) for X25519 ECDH key exchange, HKDF for key derivation, AES-256-GCM for
application-layer encryption."

Node's WebCrypto implementation (`crypto.webcrypto`, i.e. `globalThis.crypto.subtle`) does
support `X25519` for `deriveBits`/`deriveKey` as of Node 20+. However, `packages/crypto` must
be isomorphic — it is imported by both the laptop agent (Node) and the PWA (browser bundle,
Section 8). Native browser support for `X25519` via `SubtleCrypto` is inconsistent across the
engines this project targets (Section 3: "installable via home-screen on iOS Safari and
Android Chrome" — FR-4). Relying on `crypto.subtle.importKey`/`deriveBits` with the
`"X25519"` algorithm would silently break pairing on any browser engine lacking that
algorithm identifier, which is not acceptable for a security-critical handshake path (Section
10.2) with no non-cryptographic fallback.

## Decision

Use `@noble/curves` (specifically its `x25519` export from the `ed25519` module) for X25519
keypair generation and ECDH shared-secret derivation, and `@noble/hashes` for HKDF-SHA256
(RFC 5869). Both are audited, dependency-light, pure-TypeScript/JS libraries that run
identically in Node and every evergreen browser with no algorithm-availability variance.

AES-256-GCM (Section 10.2 step 7) is still implemented via native WebCrypto
(`globalThis.crypto.subtle`), since that primitive **is** consistently available in both Node
20+ and all browsers this project targets — the deviation is scoped to X25519 ECDH only.

## Consequences

- `packages/crypto` depends on `@noble/curves` and `@noble/hashes` (both from the audited
  "noble" cryptography suite maintained by Paul Miller) as runtime dependencies.
- The security property required by Section 15.1 (backend cryptographically incapable of
  decrypting session data) is unaffected — the shared secret still never leaves the two
  peers' processes; only the *implementation* of the ECDH math changed, not the protocol or
  trust model.
- If browser-native `X25519` WebCrypto support becomes universal across the PWA's supported
  browser matrix in a future revisit, this can be swapped for native WebCrypto without any
  change to `packages/protocol` or the wire format, since `x25519.ts` and `hkdf.ts` are the
  sole call sites (Section 20: "all cryptographic code lives only in `packages/crypto`").
