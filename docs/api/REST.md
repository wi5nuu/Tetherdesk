# TetherDesk REST API Reference

All endpoints are hosted on your Vercel deployment under `/api`. Every
response uses the standard envelope:

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };
```

Error codes are defined in `packages/protocol/src/errors.ts`. Common ones:

| Code | Meaning |
|---|---|
| `PAIRING_TOKEN_EXPIRED` | Token TTL (90s) elapsed before the phone scanned it |
| `PAIRING_TOKEN_ALREADY_USED` | A second confirm attempt on the same single-use token |
| `DEVICE_REVOKED` | The bearer token's associated device has been revoked |
| `RATE_LIMITED` | Too many pairing attempts from this IP (5 per 15 min) |
| `UNAUTHORIZED` | Missing or invalid bearer token |
| `VALIDATION_FAILED` | Request body failed schema validation |
| `STORE_UNAVAILABLE` | Redis or Postgres could not be reached |

---

## Authentication

All state-changing endpoints except the two pairing endpoints require a
session bearer token obtained after a successful pairing handshake.

Pass it as:
```
Authorization: Bearer <token>
```

For browser WebSocket upgrades (which cannot set arbitrary headers), pass it
as the WebSocket subprotocol:
```
Sec-WebSocket-Protocol: bearer.<token>
```

---

## Pairing

### `POST /api/pairing/start`

Called by the laptop agent to begin a new pairing session. Returns a
single-use token that expires in 90 seconds.

**Auth:** none (protected by the single-use token + rate limiting)

**Request body:**
```json
{
  "laptopPubKey": "<base64url X25519 long-term public key>",
  "laptopEphemeralPubKey": "<base64url X25519 ephemeral public key>"
}
```

**Response `200`:**
```json
{
  "ok": true,
  "data": {
    "sessionId": "sess_abc123",
    "pairingToken": "tok_xyz789"
  }
}
```

**Notes:**
- The agent encodes `{ backendOrigin, pairingToken, sessionId, laptopEphemeralPubKey }` as a QR code so the phone can reach the correct pairing session and begin the ECDH handshake.
- Rate limited to 5 requests per 15 minutes per IP.

---

### `POST /api/pairing/confirm`

Called by the phone PWA after scanning the QR code. Atomically consumes the
single-use pairing token. If successful, both sides can derive the shared
session key independently from the exchanged ephemeral public keys.

**Auth:** none (single-use pairing token in the request body)

**Request body:**
```json
{
  "pairingToken": "tok_xyz789",
  "phonePubKey": "<base64url X25519 long-term public key>",
  "phoneEphemeralPubKey": "<base64url X25519 ephemeral public key>"
}
```

**Response `200`:**
```json
{
  "ok": true,
  "data": {
    "sessionId": "sess_abc123",
    "bearerToken": "<JWT signed by JWT_SIGNING_SECRET>",
    "laptopEphemeralPubKey": "<base64url X25519 ephemeral public key>"
  }
}
```

**Error responses:**
- `PAIRING_TOKEN_EXPIRED` — token TTL elapsed
- `PAIRING_TOKEN_ALREADY_USED` — token was already consumed
- `RATE_LIMITED` — too many confirm attempts from this IP

**Notes:**
- The `bearerToken` in the response is the phone's session credential for all subsequent API calls.
- `laptopEphemeralPubKey` is returned here so the phone can perform ECDH without a separate round-trip.
- The token is consumed atomically via a Lua script — concurrent requests for the same token are guaranteed to produce at most one success.

---

## Devices

### `GET /api/devices`

Returns all devices associated with the authenticated session. When Postgres
is configured (Phase 4+), returns all devices for the session owner. When
running in Redis-only mode (Phase 1–3), returns only the current session's
device as a single-element list.

**Auth:** session bearer token

**Response `200`:**
```json
{
  "ok": true,
  "data": [
    {
      "sessionId": "sess_abc123",
      "laptopPubKey": "<base64url>",
      "phonePubKey": "<base64url>",
      "state": "active",
      "createdAt": 1753401600000,
      "lastActiveAt": 1753488000000
    }
  ]
}
```

---

### `DELETE /api/devices?deviceId=<id>`

Revokes a paired device. Takes effect immediately: a Redis revocation flag is
set synchronously, and all subsequent signaling and REST calls from that
device are rejected. The active WebRTC session (if any) is torn down within
one heartbeat interval (default 5s).

**Auth:** session bearer token

**Query params:**

| Param | Required | Description |
|---|---|---|
| `deviceId` | yes | The device ID to revoke (must belong to the authenticated session) |

**Response `200`:**
```json
{
  "ok": true,
  "data": { "revoked": true }
}
```

**Error responses:**
- `UNAUTHORIZED` — device does not belong to the authenticated session
- `VALIDATION_FAILED` — `deviceId` param missing

---

## Signaling

### `WS /api/signal` (primary path)

Native WebSocket signaling endpoint (Vercel Functions WebSocket beta). Accepts
a WebSocket upgrade for the authenticated session and immediately begins
forwarding any queued mailbox messages to the client. Incoming messages are
relayed to the other peer's mailbox.

**Auth:** session bearer token (via `Authorization: Bearer` header or
`Sec-WebSocket-Protocol: bearer.<token>`)

**Query params:**

| Param | Required | Description |
|---|---|---|
| `sessionId` | yes | The session to subscribe to |
| `recipient` | yes | The intended message recipient (`"laptop"` or `"phone"`) |

**Message format:** JSON-encoded signaling payloads (SDP offer/answer, ICE
candidates, key exchange blobs). The backend relays these without inspecting
their contents beyond size/type.

**Notes:**
- The connection is torn down at the function's `maxDuration` (60s on Hobby,
  300s on Pro). Both agent and PWA reconnect automatically — all session state
  lives in Redis, not in Function memory.
- Falls back to `GET/POST /api/signal/poll` if two consecutive upgrade
  attempts fail.

---

### `GET /api/signal/poll` (long-poll fallback)

Drains the mailbox for the authenticated session, returning any queued
messages immediately. Used when the WebSocket upgrade is unavailable (e.g.,
an intermediary proxy strips `Upgrade` headers, or the Vercel WS beta is
temporarily degraded).

**Auth:** session bearer token

**Query params:**

| Param | Required | Description |
|---|---|---|
| `sessionId` | yes | The session to drain |
| `recipient` | yes | `"laptop"` or `"phone"` |

**Response `200`:** array of pending signaling payloads (may be empty)

---

### `POST /api/signal/poll` (long-poll fallback — enqueue)

Enqueues a signaling payload for the other peer to consume via `GET
/api/signal/poll` or the WebSocket endpoint.

**Auth:** session bearer token

**Request body:**
```json
{
  "sessionId": "sess_abc123",
  "recipient": "laptop",
  "payload": { ... }
}
```

**Response `200`:**
```json
{ "ok": true, "data": { "queued": true } }
```

---

## Health

### `GET /api/health`

Public health check used by the installer to verify the deployment is running
and Redis is reachable. Returns minimal information — no secrets, no session
data.

**Auth:** none

**Response `200`:**
```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "redis": "ok",
    "version": "0.1.0"
  }
}
```

**Response `503`** (Redis unavailable):
```json
{
  "ok": false,
  "error": {
    "code": "STORE_UNAVAILABLE",
    "message": "Redis is not reachable",
    "retryable": true
  }
}
```
