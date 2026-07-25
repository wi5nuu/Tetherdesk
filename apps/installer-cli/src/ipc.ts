/**
 * IPC client for the installer-cli (Section 14.3).
 *
 * Re-exports the typed IPC wrappers from the agent's cli/ipc module so the
 * installer-cli can talk to a running agentd without duplicating the socket
 * protocol. The agent package exposes this as a direct source import since
 * both packages live in the same monorepo — the IPC module has no runtime
 * deps beyond Node builtins and is safe to import in any ESM context.
 *
 * Socket path: ~/.tetherdesk/agent.sock (Unix) or \\.\pipe\tetherdesk-agent (Windows)
 */

import { createConnection } from "node:net";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

export type AgentIPCMethod =
  | "status"
  | "pair"
  | "devices"
  | "revoke"
  | "stop"
  | "logs";

export interface IPCRequest {
  id: string;
  method: AgentIPCMethod;
  params?: unknown;
}

export interface IPCResponse {
  id: string;
  result?: unknown;
  error?: string;
}

export interface AgentStatus {
  state: "connected" | "disconnected" | "reconnecting" | "idle";
  backendOrigin: string;
  sessionId: string | null;
  pairedDeviceCount: number;
  lastHeartbeatAt: string | null;
  reconnectAttempt?: number;
  uptime: number; // seconds
}

export interface DeviceEntry {
  id: string;
  displayName: string;
  pairedAt: string;
  lastSeenAt: string | null;
  status: "active" | "revoked";
}

function socketPath(): string {
  if (process.platform === "win32") {
    return "\\\\.\\pipe\\tetherdesk-agent";
  }
  return join(homedir(), ".tetherdesk", "agent.sock");
}

function generateId(): string {
  return randomBytes(4).toString("hex");
}

/**
 * Send a single IPC request to the running agent and return the response.
 * Rejects with a clear error if the agent is not running.
 */
export async function agentIPC<T>(
  method: AgentIPCMethod,
  params?: unknown,
  timeoutMs = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = generateId();
    const request: IPCRequest = { id, method, params };

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error("IPC request timed out — is the TetherDesk agent running?"));
    }, timeoutMs);

    const socket = createConnection(socketPath());
    let buffer = "";

    socket.on("connect", () => {
      socket.write(JSON.stringify(request) + "\n");
    });

    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const newlineIdx = buffer.indexOf("\n");
      if (newlineIdx === -1) return;
      const line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      try {
        const response = JSON.parse(line) as IPCResponse;
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.result as T);
        }
      } catch {
        reject(new Error(`Malformed IPC response: ${line}`));
      }
    });

    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT" || err.code === "ECONNREFUSED") {
        reject(
          new Error(
            "TetherDesk agent is not running. Start it with `tetherdesk-agent start`."
          )
        );
      } else {
        reject(err);
      }
    });
  });
}

// -------------------------------------------------------------------------
// Typed convenience wrappers
// -------------------------------------------------------------------------

export async function getAgentStatus(): Promise<AgentStatus> {
  return agentIPC<AgentStatus>("status");
}

export async function listDevices(): Promise<DeviceEntry[]> {
  return agentIPC<DeviceEntry[]>("devices");
}

export async function revokeDevice(deviceId: string): Promise<void> {
  await agentIPC<void>("revoke", { deviceId });
}

export async function stopAgent(): Promise<void> {
  await agentIPC<void>("stop");
}

export async function startPairing(): Promise<{ pairingToken: string; sessionId: string }> {
  return agentIPC<{ pairingToken: string; sessionId: string }>("pair");
}
