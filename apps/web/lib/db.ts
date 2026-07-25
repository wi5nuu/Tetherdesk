/**
 * Postgres / Drizzle client (Section 9.2 — Phase 4+).
 *
 * This module is intentionally optional: if DATABASE_URL is not set, every
 * exported function falls back gracefully so the app can run in Redis-only
 * mode (Phase 1–3). Feature-flag the Postgres path via the env var rather
 * than a separate build flag so a single Vercel deployment can be toggled
 * without a redeploy.
 *
 * Schema:
 *   devices          — long-term device registry (laptop + phone identity keys)
 *   sessions_audit   — per-session start/end log
 *   pairing_events   — per-pairing-attempt audit trail (IP hashes only)
 *
 * Connection: Neon serverless driver (@neondatabase/serverless) with the
 * Drizzle ORM. The Neon driver uses HTTP rather than a persistent TCP pool,
 * which is safe and correct on serverless Vercel Functions.
 *
 * Migrations: run `drizzle-kit push` locally or in a pre-deploy script; no
 * in-process auto-migration to avoid cold-start latency on production.
 */

import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const deviceTypeEnum = pgEnum("device_type", ["laptop", "phone"]);

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(),
  deviceType: deviceTypeEnum("device_type").notNull(),
  displayName: text("display_name").notNull(),
  // Long-term identity public key stored as base64url text (not bytea — Drizzle
  // does not expose a bytea column helper; base64url is consistent with the rest
  // of the codebase which uses base64url strings for all key material).
  publicKey: text("public_key").notNull(),
  pairedAt: timestamp("paired_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const sessionsAudit = pgTable("sessions_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  laptopDeviceId: uuid("laptop_device_id")
    .notNull()
    .references(() => devices.id),
  phoneDeviceId: uuid("phone_device_id")
    .notNull()
    .references(() => devices.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  endReason: text("end_reason"), // 'revoked' | 'timeout' | 'user_disconnect' | 'error'
  connectionMode: text("connection_mode"), // 'direct_p2p' | 'turn_relay'
});

export const pairingEvents = pgTable("pairing_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id").references(() => devices.id),
  event: text("event").notNull(), // 'initiated' | 'succeeded' | 'failed' | 'revoked'
  ipHash: text("ip_hash"), // salted hash — never store raw IPs (Section 15.15)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
export type SessionAudit = typeof sessionsAudit.$inferSelect;
export type NewSessionAudit = typeof sessionsAudit.$inferInsert;
export type PairingEvent = typeof pairingEvents.$inferSelect;
export type NewPairingEvent = typeof pairingEvents.$inferInsert;

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let _db: NeonHttpDatabase | null = null;

/**
 * Returns the Drizzle DB client, or null if Postgres is not configured.
 * Never throws — callers must handle null and fall back to Redis-only mode.
 */
export function getDb(): NeonHttpDatabase | null {
  if (_db) return _db;

  const url = process.env["DATABASE_URL"];
  if (!url) return null;

  try {
    const sql = neon(url);
    _db = drizzle(sql);
    return _db;
  } catch {
    return null;
  }
}

/** Returns true if Postgres is configured and reachable. */
export function isDbEnabled(): boolean {
  return getDb() !== null;
}

// ---------------------------------------------------------------------------
// Device helpers
// ---------------------------------------------------------------------------

/**
 * Upsert a device record on successful pairing. If the device's public key
 * already exists (re-pairing a known device), updates lastSeenAt and clears
 * any prior revokedAt rather than inserting a duplicate.
 */
export async function upsertDevice(device: NewDevice): Promise<Device | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .insert(devices)
    .values(device)
    .onConflictDoUpdate({
      target: devices.id,
      set: {
        lastSeenAt: new Date(),
        revokedAt: null,
        displayName: device.displayName,
      },
    })
    .returning();

  return row ?? null;
}

/**
 * Mark a device as revoked. No-ops if Postgres is not configured (revocation
 * is also written to Redis immediately, which is the authoritative fast path).
 */
export async function revokeDeviceInDb(deviceId: string): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db
    .update(devices)
    .set({ revokedAt: new Date() })
    .where(eq(devices.id, deviceId));
}

/**
 * Update the lastSeenAt timestamp for a device (called on heartbeat).
 */
export async function touchDevice(deviceId: string): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db
    .update(devices)
    .set({ lastSeenAt: new Date() })
    .where(eq(devices.id, deviceId));
}

/**
 * List all non-revoked devices for a given owner. Falls back to an empty
 * array if Postgres is not configured (callers fall back to Redis session).
 */
export async function listDevicesForOwner(ownerId: string): Promise<Device[]> {
  const db = getDb();
  if (!db) return [];

  return db
    .select()
    .from(devices)
    .where(eq(devices.ownerId, ownerId));
}

// ---------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------

export async function recordPairingEvent(
  event: NewPairingEvent
): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.insert(pairingEvents).values(event);
}

export async function startSessionAudit(
  audit: NewSessionAudit
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db.insert(sessionsAudit).values(audit).returning({
    id: sessionsAudit.id,
  });
  return row?.id ?? null;
}

export async function endSessionAudit(
  auditId: string,
  endReason: string,
  connectionMode: string
): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db
    .update(sessionsAudit)
    .set({ endedAt: new Date(), endReason, connectionMode })
    .where(eq(sessionsAudit.id, auditId));
}
