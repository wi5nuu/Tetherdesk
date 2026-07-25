import type { NextRequest, NextResponse } from "next/server";
import { ErrorCode, type ApiResponse } from "@tetherdesk/protocol";
import { jsonError, jsonOk } from "@/lib/http";
import { authenticateRequest } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { redisKeys } from "@/lib/keys";
import { REVOCATION_TTL_SECONDS } from "@/lib/constants";
import { getDb, listDevicesForOwner, revokeDeviceInDb } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 10;

interface Device {
  sessionId: string;
  laptopPubKey?: string | undefined;
  phonePubKey?: string | undefined;
  state: string;
  createdAt: number;
  lastActiveAt: number;
}

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<Device[]>>> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return jsonError(ErrorCode.UNAUTHORIZED, "invalid or missing bearer token");
  }

  try {
    const redis = getRedis();
    const { sessionId } = auth.claims;

    // Phase 4+: if Postgres is configured, return all devices for this owner
    // so multi-device management (FR-6) works across sessions.
    const db = getDb();
    if (db) {
      // ownerId is stored as the sessionId of the original pairing session.
      // In a multi-user deployment this would be a stable user UUID; for the
      // single-user personal deployment the session-based owner ID is sufficient.
      const dbDevices = await listDevicesForOwner(sessionId);
      const result: Device[] = dbDevices.map((d) => ({
        sessionId: d.id,
        laptopPubKey: undefined,
        phonePubKey: d.publicKey
          ? Buffer.from(d.publicKey).toString("base64url")
          : undefined,
        state: d.revokedAt ? "revoked" : "active",
        createdAt: d.pairedAt.getTime(),
        lastActiveAt: d.lastSeenAt?.getTime() ?? d.pairedAt.getTime(),
      }));
      return jsonOk(result, 200);
    }

    // Phase 1–3 fallback: Redis-only single-session device listing.
    // Returns only the authenticated session's device as a single-element list.
    const sessionData = await redis.hgetall<Record<string, string>>(redisKeys.session(sessionId));

    if (!sessionData) {
      return jsonOk([], 200);
    }

    const device: Device = {
      sessionId,
      laptopPubKey: sessionData["laptopPubKey"],
      phonePubKey: sessionData["phonePubKey"],
      state: sessionData["state"] ?? "unknown",
      createdAt: parseInt(sessionData["createdAt"] ?? "0", 10),
      lastActiveAt: parseInt(sessionData["lastActiveAt"] ?? "0", 10),
    };

    return jsonOk([device], 200);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "devices_list_failed",
        errorType: error instanceof Error ? error.name : "unknown",
      }),
    );
    return jsonError(ErrorCode.STORE_UNAVAILABLE, "failed to retrieve device list");
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse<ApiResponse<{ revoked: boolean }>>> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return jsonError(ErrorCode.UNAUTHORIZED, "invalid or missing bearer token");
  }

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId");

  if (!deviceId) {
    return jsonError(ErrorCode.VALIDATION_FAILED, "deviceId query parameter is required");
  }

  try {
    const redis = getRedis();
    const { sessionId } = auth.claims;

    // Verify the device belongs to this session before revoking.
    // In the Redis-only model, ownership is determined by matching the deviceId
    // against the session's known public keys (which encode device identity).
    const sessionData = await redis.hgetall<Record<string, string>>(redisKeys.session(sessionId));
    const ownedDeviceIds = new Set([
      sessionData?.["sessionId"],
      sessionData?.["laptopPubKey"],
      sessionData?.["phonePubKey"],
    ].filter(Boolean));
    if (!ownedDeviceIds.has(deviceId)) {
      return jsonError(ErrorCode.UNAUTHORIZED, "device does not belong to this session");
    }

    // Fast path: Redis revocation flag (checked on every signaling request)
    await redis.set(redisKeys.revoked(deviceId), "1", { ex: REVOCATION_TTL_SECONDS });

    // Durable path: Postgres revocation record (Phase 4+, best-effort)
    await revokeDeviceInDb(deviceId).catch((err) => {
      // Log but don't fail — Redis is the authoritative fast path for revocation
      console.error(
        JSON.stringify({
          event: "device_revoke_db_failed",
          deviceId,
          errorType: err instanceof Error ? err.name : "unknown",
        }),
      );
    });

    console.log(
      JSON.stringify({
        event: "device_revoked",
        deviceId,
        revokedBy: auth.claims.sessionId,
      }),
    );

    return jsonOk({ revoked: true }, 200);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "device_revoke_failed",
        deviceId,
        errorType: error instanceof Error ? error.name : "unknown",
      }),
    );
    return jsonError(ErrorCode.STORE_UNAVAILABLE, "failed to revoke device");
  }
}
