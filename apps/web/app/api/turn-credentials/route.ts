import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { authenticateRequest, verifyAgentSecret } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { ErrorCode } from "@tetherdesk/protocol";

const TURN_HOST = "openrelay.metered.ca";
const TURN_PORT = 80;
const TURN_SECRET = "openrelayprojectsecret";
const TURN_TTL_SECONDS = 24 * 60 * 60;

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com.l.google.com:19302" },
  { urls: `stun:${TURN_HOST}:${TURN_PORT}` },
];

interface CachedTurn {
  iceServers: RTCIceServer[];
  expiresAt: number;
}

let cachedTurn: CachedTurn | null = null;

function generateTurnCredentials(): RTCIceServer[] {
  const expiryTimestamp = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
  const username = `${expiryTimestamp}:tetherdesk`;
  const hmac = createHmac("sha1", TURN_SECRET);
  hmac.update(username);
  const credential = hmac.digest("base64");

  return [
    {
      urls: `turn:${TURN_HOST}:${TURN_PORT}`,
      username,
      credential,
    },
    {
      urls: `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`,
      username,
      credential,
    },
  ];
}

function getIceServers(): RTCIceServer[] {
  if (cachedTurn && cachedTurn.expiresAt > Date.now()) {
    return cachedTurn.iceServers;
  }

  const turnServers = generateTurnCredentials();
  cachedTurn = {
    iceServers: [...STUN_SERVERS, ...turnServers],
    expiresAt: Date.now() + (TURN_TTL_SECONDS - 300) * 1000,
  };
  return cachedTurn.iceServers;
}

export async function GET(request: NextRequest) {
  const authOk = await authenticateRequest(request);
  const secretOk = verifyAgentSecret(request);
  if (!authOk.ok && !secretOk) {
    return jsonError(ErrorCode.UNAUTHORIZED, "authentication required");
  }

  const iceServers = getIceServers();
  return NextResponse.json({ ok: true, data: { iceServers } });
}
