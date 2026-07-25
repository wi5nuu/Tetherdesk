import { ErrorCode, type ErrorCode as ErrorCodeType } from "@tetherdesk/protocol";
import { signSessionToken } from "@tetherdesk/crypto";
import { generatePairingToken, generateSessionId } from "./ids.js";
import { createPairingAndSessionRecords, updateSessionRecord, consumePairingToken } from "./pairingStore.js";
import { pushToMailbox } from "./mailbox.js";
import { getJwtSigningSecret } from "./authSecret.js";
import { SESSION_BEARER_TOKEN_TTL_SECONDS } from "./constants.js";
import type { PairingConfirmInput, PairingStartInput } from "./validation.js";

export interface StartPairingResult {
  sessionId: string;
  pairingToken: string;
  bearerToken: string;
}

export async function startPairing(input: PairingStartInput): Promise<StartPairingResult> {
  const pairingToken = generatePairingToken();
  const sessionId = generateSessionId();
  const now = Date.now();

  // Sign the laptop bearer token BEFORE creating the session record so we
  // can store it in the session for the dashboard to retrieve later.
  const bearerToken = await signSessionToken(
    { sessionId, role: "laptop" },
    getJwtSigningSecret(),
    SESSION_BEARER_TOKEN_TTL_SECONDS,
  );

  // BUG-PA1: createPairingRecord and createSessionRecord were two separate
  // Redis pipelines — a crash between them would leave a pairing token that
  // points to a non-existent session, making that pairing attempt permanently
  // unresolvable (confirm would 404 on the session lookup). Fix: combine both
  // writes into a single pipeline so they land atomically in one round-trip.
  await createPairingAndSessionRecords(
    pairingToken,
    {
      laptopPubKey: input.laptopPubKey,
      laptopEphemeralPubKey: input.laptopEphemeralPubKey,
      sessionId,
      createdAt: String(now),
    },
    sessionId,
    {
      laptopPubKey: input.laptopPubKey,
      state: "pending",
      createdAt: now,
      lastActiveAt: now,
      // Store laptop JWT so dashboard can retrieve it for approval response
      laptopJwt: bearerToken,
    },
  );

  return { sessionId, pairingToken, bearerToken };
}

export type ConfirmPairingResult =
  | { ok: true; sessionId: string; bearerToken: string }
  | { ok: false; error: ErrorCodeType };

export async function confirmPairing(input: PairingConfirmInput): Promise<ConfirmPairingResult> {
  const consumed = await consumePairingToken(input.pairingToken);

  if (consumed.status === "used") {
    return { ok: false, error: ErrorCode.PAIRING_TOKEN_ALREADY_USED };
  }
  if (consumed.status === "missing") {
    return { ok: false, error: ErrorCode.PAIRING_TOKEN_EXPIRED };
  }

  const { sessionId } = consumed.record;
  const now = Date.now();

  // BUG-PA-ORDER: updateSessionRecord before pushToMailbox. If we push the
  // key-exchange message first and then the session update fails (e.g. Redis
  // hiccup), the laptop receives the key-exchange message and proceeds with
  // WebRTC while the session record still shows state:"pending" — any
  // subsequent signaling or revocation check will see an inconsistent state.
  // Update the session first so the record is in a valid "confirmed" state
  // before any downstream consumer can observe the key-exchange message.
  await updateSessionRecord(sessionId, {
    phonePubKey: input.phonePubKey,
    state: "confirmed",
    lastActiveAt: now,
  });

  // The phone already has the laptop's ephemeral public key from the QR payload itself
  // (Section 10.2 step 3) — the only thing the backend needs to relay is the phone's
  // ephemeral key, so the laptop (which only ever saw the phone via this mailbox) can
  // complete its half of the ECDH.
  await pushToMailbox(sessionId, "laptop", {
    t: "key-exchange",
    ephemeralPubKey: input.phoneEphemeralPubKey,
  });

  const bearerToken = await signSessionToken(
    { sessionId, role: "phone" },
    getJwtSigningSecret(),
    SESSION_BEARER_TOKEN_TTL_SECONDS,
  );

  return { ok: true, sessionId, bearerToken };
}
