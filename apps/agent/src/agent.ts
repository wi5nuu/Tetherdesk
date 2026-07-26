import {
  generateX25519KeyPair,
  deriveSharedSecret,
  deriveSessionKey,
  toBase64Url,
  fromBase64Url,
  importAeadKey,
  aeadDecrypt,
} from "@tetherdesk/crypto";
import type { PairingQrPayload, ApiResponse, SignalingPayload, ControlMessage } from "@tetherdesk/protocol";
import { decodeInputEvent } from "@tetherdesk/protocol";
import { renderQrToTerminal } from "./qr/render.js";
import { AgentMailbox } from "./signaling/mailbox.js";
import { WebSocketTransport, PollingTransport } from "./signaling/client.js";
import { AgentPeer, DEFAULT_STUN_SERVERS } from "./webrtc/peer.js";
import { getScreenCapture } from "./capture/index.js";
import { getInputInjector } from "./input/index.js";
import { createServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import type { Server } from "node:net";

const _require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Activity event helper — pushes a log entry to the dashboard via API
// ---------------------------------------------------------------------------
async function pushEvent(
  backendOrigin: string,
  agentSecret: string,
  opts: {
    level: "info" | "warn" | "error" | "success";
    stage: "agent" | "pairing" | "keyexchange" | "approval" | "webrtc" | "connection" | "system";
    message: string;
    sessionId?: string;
  },
): Promise<void> {
  try {
    await fetch(`${backendOrigin}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${agentSecret}`,
      },
      body: JSON.stringify(opts),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // non-fatal — dashboard log is best-effort
  }
}

export interface AgentConfig {
  backendOrigin: string;
  agentSecret: string; // Required: shared secret for authenticating agent-to-backend requests
  enableTurn?: boolean;
  turnUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
  logLevel?: "debug" | "info" | "warn" | "error";
}

interface IdentityKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

interface StartPairingData {
  sessionId: string;
  pairingToken: string;
  bearerToken: string;
}

// -------------------------------------------------------------------------
// Paths
// -------------------------------------------------------------------------
const AGENT_DIR = join(homedir(), ".tetherdesk");
const IDENTITY_KEY_PATH = join(AGENT_DIR, "identity.key");

function socketPath(): string {
  if (process.platform === "win32") return "\\\\.\\pipe\\tetherdesk-agent";
  return join(AGENT_DIR, "agent.sock");
}

// -------------------------------------------------------------------------
// Identity keypair persistence
// -------------------------------------------------------------------------

async function loadOrCreateIdentityKeyPair(): Promise<IdentityKeyPair> {
  await mkdir(AGENT_DIR, { recursive: true });
  try {
    const raw = await readFile(IDENTITY_KEY_PATH);
    // Stored as 64 bytes: 32 secretKey + 32 publicKey.
    // Use subarray() + copy to avoid stale Node buffer pool slice issues.
    if (raw.length === 64) {
      return {
        secretKey: new Uint8Array(raw.subarray(0, 32)),
        publicKey: new Uint8Array(raw.subarray(32, 64)),
      };
    }
    // BUG-A8: file exists but has wrong length — it's corrupt. Warn before
    // silently regenerating so the user isn't surprised by a new identity key
    // (which would invalidate all existing pairings).
    console.warn(
      `[TetherDesk] Identity key file at ${IDENTITY_KEY_PATH} is corrupt ` +
      `(expected 64 bytes, got ${raw.length}). Regenerating a new keypair — ` +
      `existing pairings will need to be re-established.`,
    );
  } catch {
    // File doesn't exist yet — generate fresh
  }
  const kp = generateX25519KeyPair();
  const buf = Buffer.alloc(64);
  buf.set(kp.secretKey, 0);
  buf.set(kp.publicKey, 32);
  // mode 0o600: owner-read/write only (Section 15.11 / threat-model)
  await writeFile(IDENTITY_KEY_PATH, buf, { mode: 0o600 });
  return kp;
}

// -------------------------------------------------------------------------
// IPC response types
// -------------------------------------------------------------------------
interface IPCRequest {
  id: string;
  method: string;
  params?: unknown;
}
interface IPCResponse {
  id: string;
  result?: unknown;
  error?: string;
}

// -------------------------------------------------------------------------
// Main agent class
// -------------------------------------------------------------------------

export class TetherDeskAgent {
  private config: AgentConfig;
  private identityKeyPair: IdentityKeyPair | null = null;
  private mailbox: AgentMailbox | null = null;
  private peer: AgentPeer | null = null;
  private sessionId: string | null = null;
  private sessionKey: Uint8Array | null = null;
  private bearerToken: string | null = null;
  private ipcServer: Server | null = null;
  // Singleton input injector — initialized once in _startWebRTC, reused per message (BUG-1)
  private inputInjector: ReturnType<typeof getInputInjector> | null = null;
  // Screen capture instance — kept as field so frame pump can call getResolution() per-frame
  private screenCapture: Awaited<ReturnType<typeof getScreenCapture>> | null = null;
  // AbortController to stop the frame pump loop on agent stop (BUG-4)
  private framePumpAbort: AbortController | null = null;
  // Timestamp of the last heartbeat received from the phone (ms since epoch)
  private lastHeartbeatAt: number | null = null;
  // BUG-A7: track whether _listenForWebRTCSignaling has already registered its
  // handler so re-pairing (e.g. phone re-scans QR without agent restart) does
  // not accumulate duplicate onMessage listeners on the same mailbox.
  private _webrtcSignalingListenerActive = false;

  // Reconnect state machine state (Section 17)
  private signalingState:
    | "idle"
    | "connected"
    | "disconnected"
    | "reconnecting"
    | "failed" = "idle";

  constructor(config: AgentConfig) {
    this.config = config;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    this.identityKeyPair = await loadOrCreateIdentityKeyPair();
    await this._startIPCServer();
    console.log("Agent initialized with persistent identity keypair");
    void pushEvent(this.config.backendOrigin, this.config.agentSecret, { level: "success", stage: "agent", message: "Agent initialized — ready to pair" });
  }

  async startPairing(): Promise<void> {
    if (!this.identityKeyPair) {
      throw new Error("Agent not initialized — call initialize() first");
    }

    // BUG-A-PAIR-GUARD: if a pairing is already in progress (e.g. CLI calls
    // `pair` while a previous attempt is still waiting for QR scan), reject
    // immediately rather than silently starting a second concurrent flow that
    // would leave two mailboxes and two peer connections alive.
    if (this.signalingState !== "idle" && this.signalingState !== "failed") {
      throw new Error(
        `Cannot start pairing — agent is currently in state '${this.signalingState}'. ` +
        "Call stop() first if you want to re-pair.",
      );
    }

    // Clear any stale session state from a previous pairing attempt so the
    // new attempt starts with a clean slate.
    this.sessionId = null;
    this.bearerToken = null;
    this.sessionKey = null;

    // Ephemeral keypair for this pairing attempt (Section 10.2 step 1)
    const ephemeralKeyPair = generateX25519KeyPair();

    // BUG-A2: replace manual AbortController+clearTimeout with AbortSignal.timeout()
    // which is cleaner and avoids the bug where `response` could be used uninitialized
    // if the fetch threw synchronously before the assignment.
    const response = await fetch(`${this.config.backendOrigin}/api/pairing/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        laptopPubKey: toBase64Url(this.identityKeyPair.publicKey),
        laptopEphemeralPubKey: toBase64Url(ephemeralKeyPair.publicKey),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Pairing start failed: ${response.statusText}`);
    }

    const result = (await response.json()) as ApiResponse<StartPairingData>;
    if (!result.ok) {
      throw new Error(`Pairing start failed: ${result.error.message}`);
    }

    const { sessionId, pairingToken, bearerToken } = result.data;
    this.sessionId = sessionId;
    this.bearerToken = bearerToken;

    // Render QR code (Section FR-3)
    const qrPayload: PairingQrPayload = {
      backendOrigin: this.config.backendOrigin,
      pairingToken,
      sessionId,
      laptopEphemeralPubKey: toBase64Url(ephemeralKeyPair.publicKey),
    };

    console.log("\n=== TetherDesk Pairing ===");
    console.log("Scan this QR code with your phone:\n");
    void renderQrToTerminal(qrPayload);
    console.log(`\nSession ID: ${sessionId}`);
    console.log(`Pairing token expires in 90 seconds.\n`);
    void pushEvent(this.config.backendOrigin, this.config.agentSecret, { level: "info", stage: "pairing", message: "QR code generated — waiting for phone to scan", sessionId });

    // Register the pairing URL with the backend so the web page can display
    // the same QR code — this ensures the phone and agent share the same session.
    const pairingPayload = JSON.stringify(qrPayload);
    const b64 = Buffer.from(pairingPayload).toString("base64url");
    const pairingUrl = `${this.config.backendOrigin}/pair/${b64}`;
    const expiresAt = Date.now() + 90_000;
    try {
      await fetch(`${this.config.backendOrigin}/api/pairing/active-qr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.agentSecret}`,
        },
        body: JSON.stringify({ pairingUrl, expiresAt, pairingToken }),
        signal: AbortSignal.timeout(5_000),
      });
      console.log(`Open ${this.config.backendOrigin}/dashboard on your laptop to approve the connection.\n`);
    } catch {
      // Non-fatal — the terminal QR is still valid
    }

    // Connect signaling and wait for key-exchange from phone (Section 10.2 step 6)
    await this._connectSignaling(bearerToken);
    await this._waitForKeyExchange(ephemeralKeyPair, sessionId);

    // Key exchange complete — register approval request and wait for laptop
    // web UI to approve before starting WebRTC (Section 10.2 step 8).
    await this._requestAndWaitForApproval(sessionId);

    // Approval granted — now start WebRTC
    await this._startWebRTC();
  }

  async stop(): Promise<void> {
    // BUG-4: abort the frame pump loop so the capture reader is released
    if (this.framePumpAbort) {
      this.framePumpAbort.abort();
      this.framePumpAbort = null;
    }
    // BUG-1: clean up the singleton injector
    if (this.inputInjector) {
      try { await this.inputInjector.cleanup(); } catch { /* best-effort */ }
      this.inputInjector = null;
    }
    if (this.mailbox) {
      await this.mailbox.stop();
      this.mailbox = null;
    }
    if (this.peer) {
      this.peer.close();
      this.peer = null;
    }
    if (this.ipcServer) {
      this.ipcServer.close();
      this.ipcServer = null;
    }
    // BUG-A-STOP-RESET: reset the signaling listener guard so a subsequent
    // startPairing() call registers the handler on the new mailbox instance.
    this._webrtcSignalingListenerActive = false;
    this.signalingState = "idle";
    console.log("Agent stopped");
  }

  // -------------------------------------------------------------------------
  // Signaling connection (AgentMailbox with reconnect state machine)
  // -------------------------------------------------------------------------

  private async _connectSignaling(bearerToken: string): Promise<void> {
    const signalingUrl = `${this.config.backendOrigin}/api/signal`;

    // Probe WebSocket connectivity. AgentMailbox owns the lifecycle after this —
    // do NOT keep the probe connection open (double-connect bug).
    // Hand an *unconnected* transport instance to AgentMailbox so it drives
    // connect/reconnect internally.
    let transport: import("./signaling/client.js").SignalingTransport;
    let wsProbeOk = false;
    try {
      const probe = new WebSocketTransport();
      await probe.connect(signalingUrl, bearerToken);
      await probe.disconnect();
      wsProbeOk = true;
    } catch {
      // ignore — fall back to polling
    }

    if (wsProbeOk) {
      transport = new WebSocketTransport();
    } else {
      console.log("WebSocket failed — falling back to long-poll signaling");
      const pollingTransport = new PollingTransport();
      // BUG-A-POLLING-SID: sessionId is set earlier in startPairing() before
      // _connectSignaling() is called. Guard here just in case the call order
      // is ever changed so PollingTransport gets an explicit error instead of
      // silently using "" which causes every poll to 404.
      if (!this.sessionId) {
        throw new Error("Cannot use polling transport — sessionId not set. This is a programming error.");
      }
      pollingTransport.setSessionId(this.sessionId);
      transport = pollingTransport;
    }

    this.mailbox = new AgentMailbox(transport, signalingUrl, bearerToken);

    this.mailbox.on("stateChange", (state) => {
      this.signalingState = state.status === "connected"
        ? "connected"
        : state.status === "reconnecting"
          ? "reconnecting"
          : state.status === "failed"
            ? "failed"
            : "disconnected";

      if (state.status === "reconnecting") {
        console.log(`Signaling reconnecting (attempt ${state.attempt}, retry in ${Math.round(state.nextRetryMs)}ms)…`);
      } else if (state.status === "connected") {
        console.log("Signaling connected");
      } else if (state.status === "failed") {
        console.error(`Signaling failed: ${state.reason}`);
      }
    });

    await this.mailbox.connect();
  }

  // -------------------------------------------------------------------------
  // Key exchange (Section 10.2 steps 6–7)
  // -------------------------------------------------------------------------

  private _waitForKeyExchange(
    ephemeralKeyPair: IdentityKeyPair,
    sessionId: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // BUG-A-MB-LOCAL: capture mailbox in a local const so that timeout/error
      // handlers still reference the correct mailbox instance even if stop() is
      // called concurrently and sets this.mailbox = null between the moment the
      // promise is created and the moment the handlers fire.
      const mailbox = this.mailbox;
      if (!mailbox) {
        reject(new Error("Signaling mailbox is not connected — cannot wait for key exchange"));
        return;
      }

      const timeout = setTimeout(() => {
        mailbox.off("message", onMessage);
        mailbox.off("error", onError);
        reject(new Error("Key exchange timed out after 90 seconds"));
      }, 90_000);

      const onMessage = (payload: SignalingPayload) => {
        if (payload.t !== "key-exchange") return;

        // One-shot — remove both handlers immediately to prevent accumulation
        clearTimeout(timeout);
        mailbox.off("message", onMessage);
        mailbox.off("error", onError);

        try {
          // Derive shared secret via ECDH (Section 10.2 step 7)
          const phoneEphemeralPubKey = fromBase64Url(payload.ephemeralPubKey);
          const rawSharedSecret = deriveSharedSecret(
            ephemeralKeyPair.secretKey,
            phoneEphemeralPubKey,
          );

          // Derive session key via HKDF — never transmitted (Section 10.2 step 7)
          const encoder = new TextEncoder();
          this.sessionKey = deriveSessionKey(
            rawSharedSecret,
            encoder.encode(sessionId),
            "tetherdesk/session-key/v1",
          );

          console.log("\nPairing successful — shared session key derived");
          console.log("Session key established (not shown for security)");
          void pushEvent(this.config.backendOrigin, this.config.agentSecret, { level: "success", stage: "keyexchange", message: "Key exchange complete — secure session established", sessionId });
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };

      const onError = (err: Error) => {
        clearTimeout(timeout);
        mailbox.off("message", onMessage);
        mailbox.off("error", onError);
        reject(err);
      };

      mailbox.on("message", onMessage);
      mailbox.on("error", onError);
    });
  }

  // -------------------------------------------------------------------------
  // Approval gate (Section 10.3) — after key exchange, before WebRTC
  // -------------------------------------------------------------------------

  private async _requestAndWaitForApproval(sessionId: string): Promise<void> {
    const backendOrigin = this.config.backendOrigin;
    const agentSecret = this.config.agentSecret;
    const approvalUrl = `${backendOrigin}/api/pairing/approval`;

    // 1. Register the approval request so the laptop web UI can show the modal
    try {
      await fetch(approvalUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${agentSecret}`,
        },
        body: JSON.stringify({ action: "request", sessionId }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // Non-fatal — if the backend is unreachable, proceed anyway (terminal-only mode)
      console.warn("Could not register approval request — proceeding without web-UI gate.");
      return;
    }

    console.log("\nWaiting for approval on the laptop web UI…");
    console.log(`Open the dashboard and click Allow to approve the connection.\n`);
    void pushEvent(this.config.backendOrigin, this.config.agentSecret, { level: "info", stage: "approval", message: "Waiting for approval — check the dashboard", sessionId });

    // Poll the approval result endpoint (2s interval, 90s timeout)
    const POLL_INTERVAL_MS = 2_000;
    const APPROVAL_TIMEOUT_MS = 90_000;
    const deadline = Date.now() + APPROVAL_TIMEOUT_MS;

    const result = await new Promise<"approved" | "declined" | "timeout">((resolve) => {
      const poll = async () => {
        if (Date.now() > deadline) { resolve("timeout"); return; }

        try {
          const resp = await fetch(
            `${approvalUrl}?sessionId=${encodeURIComponent(sessionId)}`,
            { signal: AbortSignal.timeout(4_000) },
          );
          if (resp.ok) {
            const json = await resp.json() as {
              ok: boolean;
              data?: { status: "pending" | "approved" | "declined" };
            };
            if (json.ok && json.data?.status === "approved") { resolve("approved"); return; }
            if (json.ok && json.data?.status === "declined") { resolve("declined"); return; }
          }
        } catch {
          // transient — keep polling
        }
        setTimeout(() => { void poll(); }, POLL_INTERVAL_MS);
      };
      void poll();
    });

    if (result === "declined") {
      console.log("\nConnection declined. Starting a new pairing session…\n");
      // Reset state so startPairing() guard allows re-entry
      this.signalingState = "idle";
      await this.stop();
      // Brief pause so the backend can clean up the old session
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
      return this.startPairing();
    }
    if (result === "timeout") {
      console.warn("Approval timed out — proceeding anyway (auto-approved after 90s).");
    } else {
      console.log("Approved — starting remote control session.");
    }
  }

  // -------------------------------------------------------------------------
  // WebRTC setup (Section 10.2 step 8, Section 12)
  // -------------------------------------------------------------------------

  private async _startWebRTC(): Promise<void> {
    console.log("\nStarting WebRTC — initializing screen capture…");
    void pushEvent(this.config.backendOrigin, this.config.agentSecret, { level: "info", stage: "webrtc", message: "Starting WebRTC — initializing screen capture", ...(this.sessionId && { sessionId: this.sessionId }) });

    // Build ICE server list (Section 12.3 / 12.4)
    const iceServers = [...DEFAULT_STUN_SERVERS];
    if (this.config.enableTurn && this.config.turnUrl) {
      const turnEntry: RTCIceServer = { urls: this.config.turnUrl };
      if (this.config.turnUsername) turnEntry.username = this.config.turnUsername;
      if (this.config.turnCredential) turnEntry.credential = this.config.turnCredential;
      iceServers.push(turnEntry);
    }

    // Get screen capture and start capturing.
    // BUG-U: wrap capture.initialize()/start() in try/catch — Phase 2 stubs
    // throw, which would crash _startWebRTC() before the peer is ever created.
    // Screen capture is best-effort; proceed without video if unavailable
    // (data channel for input injection still works).
    let videoStream: ReadableStream<Uint8Array> | null = null;
    let resolution = { width: 1920, height: 1080 }; // safe default until capture reports real size
    try {
      const capture = getScreenCapture();
      await capture.initialize();
      this.screenCapture = capture;
      resolution = await capture.getResolution();
      console.log(`Screen resolution: ${resolution.width}x${resolution.height}`);
      videoStream = await capture.start();
    } catch (err) {
      console.warn(
        "Screen capture initialization failed (Phase 2 native module not yet available):",
        err instanceof Error ? err.message : String(err),
      );
      console.warn("Proceeding without screen video — install the Phase 2 native addon for full support.");
    }

    // Read first frame to get a MediaStreamTrack-compatible source.
    // @roamhq/wrtc provides wrtc.nonstandard.RTCVideoSource / RTCVideoSink
    // for building tracks from raw frame data. We use dynamic require to
    // avoid compile-time dependency and allow graceful fallback.
    // BUG-A3: declare as MediaStreamTrack | null so the catch-branch can assign
    // null cleanly without the `null as unknown as MediaStreamTrack` unsafe cast.
    // The createOffer/createOfferDataOnly call-site below already checks for null.
    let videoTrack: MediaStreamTrack | null = null;
    try {
      if (!videoStream) throw new Error("No video stream available");
      const wrtc = _require("@roamhq/wrtc") as {
        nonstandard: {
          RTCVideoSource: new () => {
            createTrack(): MediaStreamTrack;
            onFrame(frame: { width: number; height: number; data: Uint8ClampedArray }): void;
          };
        };
      };
      const source = new wrtc.nonstandard.RTCVideoSource();
      videoTrack = source.createTrack();

      // Pump frames from the capture stream into the WebRTC video source
      // BUG-4: use AbortController so the loop exits cleanly when agent stops
      this.framePumpAbort = new AbortController();
      const abortSignal = this.framePumpAbort.signal;
      // BUG-A-PUMP-ERR: attach .catch() so errors from reader.read() or
      // onFrame() are logged rather than silently swallowed in the void IIFE.
      void (async () => {
        const reader = videoStream.getReader();
        try {
          while (!abortSignal.aborted) {
            const { done, value } = await reader.read();
            if (done || abortSignal.aborted) break;
            if (value) {
              // value is I420 frame from WindowsScreenCapture;
              // use cachedResolution which is updated per-frame by the capture module
              const res = await this.screenCapture!.getResolution();
              source.onFrame({
                width: res.width,
                height: res.height,
                data: new Uint8ClampedArray(value.buffer),
              });
            }
          }
        } finally {
          // BUG-A4: always release the reader lock, even if reader.read() throws
          reader.releaseLock();
        }
      })().catch((err: unknown) => {
        console.error("Frame pump error:", err instanceof Error ? err.message : String(err));
      });
    } catch (err) {
      // @roamhq/wrtc not installed or RTCVideoSource not available —
      // proceed without video track; data channel (input) still works.
      console.warn("Could not create video track:", err instanceof Error ? err.message : String(err));
      console.warn("Proceeding without screen video — install @roamhq/wrtc for full support.");
      // BUG-A3: null as unknown as MediaStreamTrack is an unsafe cast that
      // confuses downstream code. Use null instead and handle it at the call
      // site in createOffer (which already has the videoTrack null-check).
      videoTrack = null;
    }

    // BUG-1: initialize inputInjector once as a class field, not per-message
    // BUG-S: wrap initialize() in try/catch — Phase 2 stubs throw, which would
    // crash _startWebRTC() entirely. Input injection is best-effort; proceed
    // without it (data channel still opens, injection silently no-ops).
    this.inputInjector = getInputInjector();
    try {
      await this.inputInjector.initialize();
    } catch (err) {
      console.warn(
        "Input injector initialization failed (Phase 2 native module not yet available):",
        err instanceof Error ? err.message : String(err),
      );
      console.warn("Proceeding without input injection — install the Phase 2 native addon for full support.");
      this.inputInjector = null;
    }

    this.peer = new AgentPeer({
      iceServers,
      onIceCandidate: (candidate) => {
        // BUG-A-ICE-SEND: log errors from mailbox.send() so ICE failures are
        // visible in the log rather than silently swallowed in the void chain.
        void this.mailbox?.send("phone", {
          t: "ice-candidate",
          candidate: candidate.candidate ?? "",
          sdpMid: candidate.sdpMid ?? null,
          sdpMLineIndex: candidate.sdpMLineIndex ?? null,
        }).catch((err: unknown) => {
          console.warn("Failed to send ICE candidate:", err instanceof Error ? err.message : String(err));
        });
      },
      onConnectionStateChange: (state) => {
        console.log(`WebRTC connection state: ${state}`);
        if (state === "connected") {
          console.log("WebRTC peer connected — remote control active");
          void pushEvent(this.config.backendOrigin, this.config.agentSecret, { level: "success", stage: "connection", message: "Phone connected — remote control is now active", ...(this.sessionId && { sessionId: this.sessionId }) });
          // Send resolution so the phone can scale its control surface correctly
          void this._sendControlMessage({
            t: "resolutionChanged",
            width: resolution.width,
            height: resolution.height,
          });
        } else if (state === "failed") {
          const noTurn = !this.config.enableTurn;
          const msg = noTurn
            ? "WebRTC connection failed — no TURN relay configured."
            : "WebRTC connection failed — check TURN credentials.";
          console.error(msg);
          void pushEvent(this.config.backendOrigin, this.config.agentSecret, { level: "error", stage: "webrtc", message: msg, ...(this.sessionId && { sessionId: this.sessionId }) });
        } else if (state === "disconnected") {
          console.log("WebRTC disconnected — waiting for reconnect…");
          void pushEvent(this.config.backendOrigin, this.config.agentSecret, { level: "warn", stage: "connection", message: "Phone disconnected — waiting for reconnect", ...(this.sessionId && { sessionId: this.sessionId }) });
        }
      },
      onDataChannelMessage: (data) => {
        void this._handleDataChannelMessage(data);
      },
    });

    // Create SDP offer with the video track (Section 12.2)
    let offer: RTCSessionDescriptionInit;
    if (videoTrack) {
      offer = await this.peer.createOffer(videoTrack);
    } else {
      // No video track — create offer for data channel only
      offer = await this.peer.createOfferDataOnly();
    }

    console.log("Sending SDP offer to phone via signaling…");

    // Relay the offer to the phone via signaling mailbox
    await this.mailbox!.send("phone", {
      t: "sdp-offer",
      sdp: offer.sdp ?? "",
    });

    // Now listen for: sdp-answer and ice-candidate messages from phone
    this._listenForWebRTCSignaling();
  }

  private _listenForWebRTCSignaling(): void {
    // BUG-A7: guard against accumulating duplicate handlers when _startWebRTC()
    // is called a second time (e.g. phone re-scans QR without agent restart).
    // The first invocation registers the handler; subsequent calls are no-ops
    // because the existing handler already covers the new peer/mailbox state
    // via closure over `this`.
    if (this._webrtcSignalingListenerActive) return;
    this._webrtcSignalingListenerActive = true;

    const onMessage = (payload: SignalingPayload) => {
      if (payload.t === "sdp-answer") {
        void this.peer?.applyAnswer({
          type: "answer",
          sdp: payload.sdp,
        }).catch((err: unknown) => {
          console.error("Failed to apply SDP answer:", err instanceof Error ? err.message : String(err));
        });
      } else if (payload.t === "ice-candidate") {
        void this.peer?.addIceCandidate({
          candidate: payload.candidate,
          sdpMid: payload.sdpMid ?? null,
          sdpMLineIndex: payload.sdpMLineIndex ?? null,
        }).catch((err: unknown) => {
          // ICE candidate errors are common and mostly benign — log but don't throw
          console.debug("ICE candidate error (usually benign):", err instanceof Error ? err.message : String(err));
        });
      }
    };

    // This handler lives for the session lifetime — no off() needed here
    // since the mailbox is torn down when the agent stops
    this.mailbox?.on("message", onMessage);
  }

  // -------------------------------------------------------------------------
  // Data channel message handling (input injection)
  // -------------------------------------------------------------------------

  private async _handleDataChannelMessage(data: ArrayBuffer | string): Promise<void> {
    try {
      let bytes: Uint8Array;

      // BUG-2: both binary AND string messages must go through decryption if a
      // session key is set — an attacker (or a future path) could send an
      // encrypted string payload. Decode string → bytes first, then decrypt.
      if (typeof data === "string") {
        bytes = new TextEncoder().encode(data);
      } else {
        bytes = new Uint8Array(data);
      }

      // If a session key is set, decrypt the AES-256-GCM envelope first.
      // Wire format: 12-byte IV | ciphertext | 16-byte GCM tag
      if (this.sessionKey && bytes.length > 12) {
        try {
          bytes = await this._decryptPayload(bytes);
        } catch {
          // Decryption failed — drop the message (do not inject potentially
          // malicious input that bypassed encryption)
          console.error("Input event decryption failed — dropping message");
          return;
        }
      }

      // Try JSON control message first (heartbeat, clipboard)
      if (bytes[0] === 0x7b /* '{' */) {
        try {
          // H007: Limit data channel message size to prevent DoS
          if (bytes.length > 50_000) {
            console.error(`Data channel message too large: ${bytes.length} bytes, dropping`);
            return;
          }
          const msg = JSON.parse(new TextDecoder().decode(bytes)) as { t: string } & Record<string, unknown>;
          if (msg.t === "heartbeat") {
            this.lastHeartbeatAt = Date.now();
            void this._sendControlMessage({ t: "heartbeat", ts: this.lastHeartbeatAt });
          } else if (msg.t === "clipboard") {
            console.log("Clipboard sync received (platform support varies)");
          }
          return;
        } catch {
          // Not JSON — fall through to binary decode
        }
      }

      // Decode and inject the input event (BUG-A: decodeInputEvent hoisted to top-level import)
      const event = decodeInputEvent(bytes);

      // BUG-1: use the singleton injector, not a new instance per message
      const injector = this.inputInjector;
      if (!injector) {
        console.warn("InputInjector not initialized — dropping input event");
        return;
      }
      switch (event.t) {
        case "pointer":
          await injector.injectPointer(event.x, event.y, event.buttons);
          break;
        case "scroll":
          await injector.injectScroll(event.dx, event.dy);
          break;
        case "key":
          await injector.injectKey(event.code, event.down);
          break;
        case "touch":
          await injector.injectTouch(event.points);
          break;
      }
    } catch (err) {
      console.error("Error handling data channel message:", err instanceof Error ? err.message : String(err));
    }
  }

  // BUG-3: use @tetherdesk/crypto (aeadDecrypt) instead of node:crypto directly.
  // Wire format: 12-byte IV | ciphertext+tag (aeadDecrypt splits them internally).
  private async _decryptPayload(encrypted: Uint8Array): Promise<Uint8Array> {
    if (!this.sessionKey) throw new Error("No session key");
    const iv = encrypted.slice(0, 12);
    const ciphertext = encrypted.slice(12);
    const key = await importAeadKey(this.sessionKey);
    return aeadDecrypt(key, { iv, ciphertext });
  }

  // BUG-6: typed as ControlMessage, not Record<string, unknown>
  private async _sendControlMessage(msg: ControlMessage): Promise<void> {
    try {
      this.peer?.send(JSON.stringify(msg));
    } catch {
      // Data channel not open yet — ignore
    }
  }

  // -------------------------------------------------------------------------
  // IPC server (Section 14.3) — Unix socket / named pipe
  // -------------------------------------------------------------------------

  private async _startIPCServer(): Promise<void> {
    const path = socketPath();

    // Remove stale socket file on Unix
    if (process.platform !== "win32") {
      try {
        const { unlink } = await import("node:fs/promises");
        await unlink(path);
      } catch {
        // Didn't exist — fine
      }
    }

    this.ipcServer = createServer((socket) => {
      let buf = "";

      socket.on("data", (chunk) => {
        buf += chunk.toString();
        // H007: Prevent DoS via huge IPC messages
        if (buf.length > 100_000) {
          console.error(`IPC buffer too large (${buf.length} bytes), resetting`);
          buf = "";
          socket.destroy();
          return;
        }
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const req = JSON.parse(line) as IPCRequest;
            void this._handleIPCRequest(req).then((resp) => {
              socket.write(JSON.stringify(resp) + "\n");
            });
          } catch {
            // Ignore malformed IPC lines
          }
        }
      });

      socket.on("error", () => {
        socket.destroy();
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.ipcServer!.listen(path, () => resolve());
      this.ipcServer!.on("error", reject);
    });
  }

  private async _handleIPCRequest(req: IPCRequest): Promise<IPCResponse> {
    try {
      switch (req.method) {
        case "status":
          return {
            id: req.id,
            result: {
              state: this.signalingState,
              backendOrigin: this.config.backendOrigin,
              sessionId: this.sessionId,
              uptime: process.uptime(),
              lastHeartbeatAt: this.lastHeartbeatAt,
              pairedDeviceCount: this.sessionId ? 1 : 0,
            },
          };

        case "stop":
          setTimeout(() => void this.stop(), 100);
          return { id: req.id, result: "stopping" };

        case "pair":
          void this.startPairing().catch((err: unknown) =>
            console.error("Pairing error:", err instanceof Error ? err.message : String(err)),
          );
          return { id: req.id, result: { sessionId: this.sessionId } };

        case "devices": {
          if (!this.bearerToken || !this.config.backendOrigin) {
            return { id: req.id, result: [] };
          }
          const resp = await fetch(`${this.config.backendOrigin}/api/devices`, {
            headers: { Authorization: `Bearer ${this.bearerToken}` },
            signal: AbortSignal.timeout(10_000),
          });
          const data = (await resp.json()) as { ok: boolean; data?: unknown[] };
          return { id: req.id, result: data.ok ? (data.data ?? []) : [] };
        }

        case "revoke": {
          const params = req.params as { deviceId?: string } | undefined;
          if (!params?.deviceId || !this.bearerToken) {
            return { id: req.id, error: "deviceId required and agent must be paired" };
          }
          const resp = await fetch(
            `${this.config.backendOrigin}/api/devices?deviceId=${encodeURIComponent(params.deviceId)}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${this.bearerToken}` },
              signal: AbortSignal.timeout(10_000),
            },
          );
          return { id: req.id, result: resp.ok ? "revoked" : "failed" };
        }

        default:
          return { id: req.id, error: `Unknown method: ${req.method}` };
      }
    } catch (err) {
      return {
        id: req.id,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
