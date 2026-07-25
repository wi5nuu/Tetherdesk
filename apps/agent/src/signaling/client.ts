import WebSocket from "ws";
import type { SignalingPayload } from "@tetherdesk/protocol";

/**
 * Signaling transport interface - implemented by both WebSocket and polling transports.
 */
export interface SignalingTransport {
  /**
   * Connect to the signaling server.
   */
  connect(url: string, bearerToken: string): Promise<void>;

  /**
   * Send a signaling message to the specified recipient.
   */
  send(recipient: "laptop" | "phone", payload: SignalingPayload): Promise<void>;

  /**
   * Receive the next batch of signaling messages.
   */
  receive(): Promise<SignalingPayload[]>;

  /**
   * Disconnect from the signaling server.
   */
  disconnect(): Promise<void>;

  /**
   * Check if currently connected.
   */
  isConnected(): boolean;

  /**
   * Set up event handlers.
   */
  on(event: "message", handler: (payload: SignalingPayload) => void): void;
  on(event: "error", handler: (error: Error) => void): void;
  on(event: "close", handler: () => void): void;

  /**
   * Remove a previously-registered event handler (BUG-7: prevents accumulation on reconnect).
   */
  off(event: "message", handler: (payload: SignalingPayload) => void): void;
  off(event: "error", handler: (error: Error) => void): void;
  off(event: "close", handler: () => void): void;
}

/**
 * WebSocket-based signaling transport (primary path).
 */
export class WebSocketTransport implements SignalingTransport {
  private ws: WebSocket | null = null;
  private messageHandlers: Array<(payload: SignalingPayload) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];

  async connect(url: string, bearerToken: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = url.replace(/^http/, "ws");
      this.ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      });

      // BUG-9: use a resolved flag so that an "error" event followed by a
      // "close" event (which node's ws library always emits after error) does
      // not double-fire the reject / close handlers.
      let settled = false;

      this.ws.on("open", () => {
        settled = true;
        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const raw = data.toString();
          // H007: Prevent DoS via huge signaling messages
          if (raw.length > 100_000) {
            throw new Error(`Signaling message too large: ${raw.length} bytes`);
          }
          const payload = JSON.parse(raw) as SignalingPayload;
          this.messageHandlers.forEach((handler) => handler(payload));
        } catch (error) {
          this.errorHandlers.forEach((handler) =>
            handler(error instanceof Error ? error : new Error(String(error))),
          );
        }
      });

      this.ws.on("error", (error: Error) => {
        this.errorHandlers.forEach((handler) => handler(error));
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      this.ws.on("close", () => {
        // Only fire close handlers if the connection was previously established,
        // to avoid double-firing on a connect-time error (error fires, then close fires).
        if (settled) {
          this.closeHandlers.forEach((handler) => handler());
        } else {
          settled = true;
          // Connection never opened — reject with a generic error if error handler
          // didn't already reject (e.g. clean close before open on some environments)
          reject(new Error("WebSocket closed before connection was established"));
        }
      });
    });
  }

  async send(recipient: "laptop" | "phone", payload: SignalingPayload): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    // BUG-C-SEND-CB: use the callback form of ws.send() so network-layer
    // errors (EPIPE, ECONNRESET) are surfaced as a rejected promise rather
    // than being silently swallowed when the socket drops mid-send.
    await new Promise<void>((resolve, reject) => {
      this.ws!.send(
        JSON.stringify({ recipient, payload }),
        (err) => { if (err) reject(err); else resolve(); },
      );
    });
  }

  async receive(): Promise<SignalingPayload[]> {
    // WebSocket transport uses event-based message delivery
    // This method is a no-op for compatibility with the interface
    return [];
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      // BUG-C1: wait for the socket to actually close before resolving so
      // callers (e.g. the WS probe in _connectSignaling) don't open a second
      // connection while the first is still in CLOSING state.
      await new Promise<void>((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) {
          resolve();
          return;
        }
        ws.once("close", () => resolve());
        ws.close();
      });
      // BUG-C-HANDLERS: clear handler arrays after disconnect so stale handlers
      // from a previous connect() call don't accumulate if the transport instance
      // is reused (or a future maintainer calls connect() again after disconnect()).
      this.messageHandlers = [];
      this.errorHandlers = [];
      this.closeHandlers = [];
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  on(event: "message", handler: (payload: SignalingPayload) => void): void;
  on(event: "error", handler: (error: Error) => void): void;
  on(event: "close", handler: () => void): void;
  on(event: "message" | "error" | "close", handler: ((payload: SignalingPayload) => void) | ((error: Error) => void) | (() => void)): void {
    if (event === "message") {
      this.messageHandlers.push(handler as (payload: SignalingPayload) => void);
    } else if (event === "error") {
      this.errorHandlers.push(handler as (error: Error) => void);
    } else if (event === "close") {
      this.closeHandlers.push(handler as () => void);
    }
  }

  // BUG-7: remove a previously-registered handler to prevent accumulation on reconnect
  off(event: "message", handler: (payload: SignalingPayload) => void): void;
  off(event: "error", handler: (error: Error) => void): void;
  off(event: "close", handler: () => void): void;
  off(event: "message" | "error" | "close", handler: ((payload: SignalingPayload) => void) | ((error: Error) => void) | (() => void)): void {
    if (event === "message") {
      this.messageHandlers = this.messageHandlers.filter(
        (h) => h !== (handler as (payload: SignalingPayload) => void),
      );
    } else if (event === "error") {
      this.errorHandlers = this.errorHandlers.filter(
        (h) => h !== (handler as (error: Error) => void),
      );
    } else if (event === "close") {
      this.closeHandlers = this.closeHandlers.filter(
        (h) => h !== (handler as () => void),
      );
    }
  }
}

/**
 * HTTP long-poll based signaling transport (fallback).
 */
export class PollingTransport implements SignalingTransport {
  private pollInterval: NodeJS.Timeout | null = null;
  private connected = false;
  private messageHandlers: Array<(payload: SignalingPayload) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private baseUrl = "";
  private bearerToken = "";
  private sessionId = "";

  setSessionId(id: string): void {
    this.sessionId = id;
  }

  async connect(url: string, bearerToken: string): Promise<void> {
    this.baseUrl = url;
    this.bearerToken = bearerToken;

    // BUG-10: guard sessionId BEFORE setting connected=true, so isConnected()
    // never returns true for a transport that will immediately fail to poll.
    if (!this.sessionId) {
      throw new Error("PollingTransport: sessionId must be set via setSessionId() before connect()");
    }

    this.connected = true;

    // Start polling for messages
    this.startPolling();
  }

  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      try {
        const messages = await this.receive();
        messages.forEach((payload) => {
          this.messageHandlers.forEach((handler) => handler(payload));
        });
      } catch (error) {
        this.errorHandlers.forEach((handler) =>
          handler(error instanceof Error ? error : new Error(String(error))),
        );
      }
    }, 1000);
  }

  async send(recipient: "laptop" | "phone", payload: SignalingPayload): Promise<void> {
    if (!this.connected) {
      throw new Error("Transport not connected");
    }

    const response = await fetch(`${this.baseUrl}/poll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.bearerToken}`,
      },
      body: JSON.stringify({
        sessionId: this.sessionId,
        recipient,
        payload,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }
  }

  async receive(): Promise<SignalingPayload[]> {
    if (!this.connected) {
      return [];
    }

    const response = await fetch(
      `${this.baseUrl}/poll?sessionId=${this.sessionId}&recipient=laptop`,
      {
        headers: {
          Authorization: `Bearer ${this.bearerToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to receive messages: ${response.statusText}`);
    }

    const result = (await response.json()) as { ok: boolean; data: SignalingPayload[] };
    return result.ok ? result.data : [];
  }

  async disconnect(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.connected = false;
    this.closeHandlers.forEach((handler) => handler());
  }

  isConnected(): boolean {
    return this.connected;
  }

  on(event: "message", handler: (payload: SignalingPayload) => void): void;
  on(event: "error", handler: (error: Error) => void): void;
  on(event: "close", handler: () => void): void;
  on(event: "message" | "error" | "close", handler: ((payload: SignalingPayload) => void) | ((error: Error) => void) | (() => void)): void {
    if (event === "message") {
      this.messageHandlers.push(handler as (payload: SignalingPayload) => void);
    } else if (event === "error") {
      this.errorHandlers.push(handler as (error: Error) => void);
    } else if (event === "close") {
      this.closeHandlers.push(handler as () => void);
    }
  }

  // BUG-7: remove handler to prevent accumulation on reconnect
  off(event: "message", handler: (payload: SignalingPayload) => void): void;
  off(event: "error", handler: (error: Error) => void): void;
  off(event: "close", handler: () => void): void;
  off(event: "message" | "error" | "close", handler: ((payload: SignalingPayload) => void) | ((error: Error) => void) | (() => void)): void {
    if (event === "message") {
      this.messageHandlers = this.messageHandlers.filter(
        (h) => h !== (handler as (payload: SignalingPayload) => void),
      );
    } else if (event === "error") {
      this.errorHandlers = this.errorHandlers.filter(
        (h) => h !== (handler as (error: Error) => void),
      );
    } else if (event === "close") {
      this.closeHandlers = this.closeHandlers.filter(
        (h) => h !== (handler as () => void),
      );
    }
  }
}
