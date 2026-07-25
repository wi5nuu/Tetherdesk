import { verifySessionToken, SessionTokenInvalidError, type SessionTokenClaims } from "@tetherdesk/crypto";
import { getJwtSigningSecret } from "./authSecret";

export type AuthResult = { ok: true; claims: SessionTokenClaims } | { ok: false };

/**
 * Verifies that the request carries the correct AGENT_SECRET shared secret.
 * Used to authenticate agent-to-backend calls (POST /api/pairing/active-qr,
 * POST /api/events, POST /api/pairing/approval action=request).
 *
 * The agent sends: Authorization: Bearer <AGENT_SECRET>
 * The backend compares it to process.env.AGENT_SECRET using a constant-time
 * comparison to prevent timing attacks.
 */
export function verifyAgentSecret(request: Request): boolean {
  const secret = process.env["AGENT_SECRET"];
  // If AGENT_SECRET is not configured, fail closed — never allow unauthenticated writes.
  if (!secret || secret.length === 0) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const provided = authHeader.slice("Bearer ".length).trim();

  // Constant-time comparison: prevent timing oracle on the secret value.
  if (provided.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) {
    diff |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Extracts the bearer token from an HTTP request.
 *
 * Checks two sources in order:
 * 1. `Authorization: Bearer <token>` header — standard for REST and agent WebSocket
 *    connections where the `ws` Node.js client can set custom headers.
 * 2. `Sec-WebSocket-Protocol` header — browser WebSocket connections cannot set
 *    arbitrary headers, so the token is passed as the subprotocol string. The
 *    Vercel WS beta runtime exposes this header on the upgrade request.
 */
function extractBearerToken(request: Request): string | null {
  // 1. Standard Authorization header (agent / server-side clients)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  // 2. Sec-WebSocket-Protocol header (browser PWA clients)
  // The browser sends: Sec-WebSocket-Protocol: bearer.<token>
  const proto = request.headers.get("sec-websocket-protocol");
  if (proto) {
    // May be a comma-separated list; find the bearer token entry
    for (const part of proto.split(",")) {
      const trimmed = part.trim();
      if (trimmed.startsWith("bearer.")) {
        return trimmed.slice("bearer.".length);
      }
    }
  }

  return null;
}

/** Verifies the bearer token from the request against the session bearer token
 * scheme (Section 10.1). Every state-changing endpoint except the two pairing endpoints
 * requires this (Section 13).
 *
 * For WebSocket upgrades from browser clients, the token is read from the
 * `Sec-WebSocket-Protocol` header (see `extractBearerToken`). */
export async function authenticateRequest(request: Request): Promise<AuthResult> {
  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false };
  }
  try {
    const claims = await verifySessionToken(token, getJwtSigningSecret());
    return { ok: true, claims };
  } catch (error) {
    if (error instanceof SessionTokenInvalidError) {
      return { ok: false };
    }
    throw error;
  }
}
