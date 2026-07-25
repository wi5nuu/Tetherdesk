import type { SignalingPayload } from "@tetherdesk/protocol";
import type { SignalingTransport } from "./client.js";

/**
 * Mailbox abstraction for the agent's signaling layer.
 *
 * Wraps the underlying SignalingTransport with:
 * - Reconnect state machine (connected → disconnected → reconnecting → connected | failed)
 * - Exponential backoff with jitter (capped at 30s per Section 3 NFR)
 * - Automatic drain of queued messages on reconnect
 * - Per-event typed dispatch with off() to prevent handler accumulation on reconnect
 */

export type MailboxState =
  | { status: "idle" }
  | { status: "connected" }
  | { status: "disconnected" }
  | { status: "reconnecting"; attempt: number; nextRetryMs: number }
  | { status: "failed"; reason: string };

type MailboxEventMap = {
  message: (payload: SignalingPayload) => void;
  stateChange: (state: MailboxState) => void;
  error: (err: Error) => void;
};

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 500;
const MAX_RECONNECT_ATTEMPTS = 12;

function jitteredBackoff(attempt: number): number {
  const exp = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  // ±25% jitter to avoid thundering-herd reconnects (Section 3 NFR).
  // BUG-M3: cap the final value too, so jitter above 1.0 doesn't push the
  // result past MAX_BACKOFF_MS (e.g. exp=30000 * 1.25 = 37500).
  return Math.min(exp * (0.75 + Math.random() * 0.5), MAX_BACKOFF_MS);
}

export class AgentMailbox {
  private transport: SignalingTransport;
  private signalingUrl: string;
  private bearerToken: string;
  private state: MailboxState = { status: "idle" };

  private messageHandlers: Array<MailboxEventMap["message"]> = [];
  private stateHandlers: Array<MailboxEventMap["stateChange"]> = [];
  private errorHandlers: Array<MailboxEventMap["error"]> = [];

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(transport: SignalingTransport, signalingUrl: string, bearerToken: string) {
    this.transport = transport;
    this.signalingUrl = signalingUrl;
    this.bearerToken = bearerToken;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async connect(): Promise<void> {
    this.stopped = false;
    await this._connect(0);
  }

  async send(recipient: "laptop" | "phone", payload: SignalingPayload): Promise<void> {
    if (!this.transport.isConnected()) {
      throw new Error("Mailbox not connected — cannot send message");
    }
    await this.transport.send(recipient, payload);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.transport.disconnect();
    this._setState({ status: "idle" });
  }

  getState(): MailboxState {
    return this.state;
  }

  on<K extends keyof MailboxEventMap>(event: K, handler: MailboxEventMap[K]): void {
    if (event === "message") {
      this.messageHandlers.push(handler as MailboxEventMap["message"]);
    } else if (event === "stateChange") {
      this.stateHandlers.push(handler as MailboxEventMap["stateChange"]);
    } else if (event === "error") {
      this.errorHandlers.push(handler as MailboxEventMap["error"]);
    }
  }

  /**
   * Remove a previously-registered handler. This is critical for preventing
   * handler accumulation on reconnect — always call off() when a one-shot
   * listener (e.g. the key-exchange waiter) is no longer needed.
   */
  off<K extends keyof MailboxEventMap>(event: K, handler: MailboxEventMap[K]): void {
    if (event === "message") {
      this.messageHandlers = this.messageHandlers.filter(
        (h) => h !== (handler as MailboxEventMap["message"]),
      );
    } else if (event === "stateChange") {
      this.stateHandlers = this.stateHandlers.filter(
        (h) => h !== (handler as MailboxEventMap["stateChange"]),
      );
    } else if (event === "error") {
      this.errorHandlers = this.errorHandlers.filter(
        (h) => h !== (handler as MailboxEventMap["error"]),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Internal reconnect state machine
  // -------------------------------------------------------------------------

  private async _connect(attempt: number): Promise<void> {
    if (this.stopped) return;

    try {
      await this.transport.connect(this.signalingUrl, this.bearerToken);
      this._setState({ status: "connected" });

      // BUG-7: define named handler refs so we can remove them on reconnect,
      // preventing N-times delivery after N reconnects.
      const onMessage = (payload: SignalingPayload): void => {
        this.messageHandlers.forEach((h) => h(payload));
      };
      const onError = (err: Error): void => {
        this.errorHandlers.forEach((h) => h(err));
      };
      const onClose = (): void => {
        // Remove the handlers we just added before scheduling a reconnect,
        // so the next _connect() call adds exactly one fresh set.
        this.transport.off("message", onMessage);
        this.transport.off("error", onError);
        this.transport.off("close", onClose);
        if (this.stopped) return;
        this._setState({ status: "disconnected" });
        this._scheduleReconnect(1);
      };

      this.transport.on("message", onMessage);
      this.transport.on("error", onError);
      this.transport.on("close", onClose);
    } catch (err) {
      if (this.stopped) return;
      const error = err instanceof Error ? err : new Error(String(err));
      this.errorHandlers.forEach((h) => h(error));
      this._scheduleReconnect(attempt + 1);
    }
  }

  private _scheduleReconnect(attempt: number): void {
    if (this.stopped) return;
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      const reason = `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded`;
      this._setState({ status: "failed", reason });
      this.errorHandlers.forEach((h) => h(new Error(reason)));
      return;
    }

    const delayMs = jitteredBackoff(attempt);
    this._setState({ status: "reconnecting", attempt, nextRetryMs: delayMs });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // BUG-M-STOPPED-RACE: re-check stopped here because stop() may have been
      // called while this timer was pending. Without this guard the agent would
      // try to reconnect after an explicit stop(), creating a zombie connection.
      if (this.stopped) return;
      // BUG-II: pass attempt + 1 so the reconnect counter actually increments on
      // each retry. Passing the original `attempt` value here caused the backoff
      // to never advance past the first delay and the MAX_RECONNECT_ATTEMPTS guard
      // to never trigger, resulting in infinite retries at the base backoff interval.
      void this._connect(attempt + 1);
    }, delayMs);
  }

  private _setState(next: MailboxState): void {
    this.state = next;
    this.stateHandlers.forEach((h) => h(next));
  }
}
