import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

/** Session bearer token claims (Section 10.1) — issued after a successful pairing handshake,
 * scoped to one session and one device role. The backend signs these with a key generated at
 * deployment time (`JWT_SIGNING_SECRET`); it never holds a password or long-term secret for
 * either device beyond their public keys. */
export interface SessionTokenClaims {
  sessionId: string;
  role: "laptop" | "phone";
}

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const MIN_TTL_SECONDS = 60; // 1 minute minimum
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days maximum

export async function signSessionToken(
  claims: SessionTokenClaims,
  signingSecret: Uint8Array,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  // Validate ttlSeconds to prevent instant/never expiration attacks
  if (!Number.isFinite(ttlSeconds) || ttlSeconds < MIN_TTL_SECONDS || ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error(
      `ttlSeconds must be between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS}, got ${ttlSeconds}`
    );
  }
  
  return new SignJWT({ sessionId: claims.sessionId, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(signingSecret);
}

export class SessionTokenInvalidError extends Error {}

export async function verifySessionToken(
  token: string,
  signingSecret: Uint8Array,
): Promise<SessionTokenClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, signingSecret));
  } catch (error: unknown) {
    if (error instanceof joseErrors.JOSEError) {
      throw new SessionTokenInvalidError((error as Error).message);
    }
    throw error;
  }
  const { sessionId, role } = payload;
  if (typeof sessionId !== "string" || (role !== "laptop" && role !== "phone")) {
    throw new SessionTokenInvalidError("malformed session token claims");
  }
  return { sessionId, role };
}
