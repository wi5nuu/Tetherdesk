/**
 * IPC subcommands for the local agent CLI (Section 14.3).
 *
 * These commands talk to the already-running agentd process over a local
 * Unix socket (macOS/Linux) or a named pipe (Windows) rather than
 * re-initialising the agent. This keeps `tetherdesk status` fast and
 * offline-capable for local-only queries.
 *
 * Socket path: ~/.tetherdesk/agent.sock (Unix) or \\.\pipe\tetherdesk-agent (Windows)
 *
 * Protocol: newline-delimited JSON over the socket.
 * Request:  { id: string; method: string; params?: unknown }
 * Response: { id: string; result?: unknown; error?: string }
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

    const socket = createConnection(socketPath(), () => {
      socket.write(JSON.stringify(request) + "\n");
    });

    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line) as IPCResponse;
          if (response.id !== id) continue;
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          socket.end();
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.result as T);
          }
        } catch {
          // Ignore malformed lines
        }
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
