"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  encodeInputEvent,
  type InputEvent,
  type ControlMessage,
} from "@tetherdesk/protocol";
import { fromBase64Url } from "@tetherdesk/crypto";

type ConnectionState =
  | "loading"
  | "awaiting-approval"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

interface SessionInfo {
  backendOrigin: string;
  sessionId: string;
  bearerToken: string;
  sessionKeyB64: string;
}

// -------------------------------------------------------------------------
// AES-256-GCM application-layer encryption helpers (Section 10.2 step 7)
// -------------------------------------------------------------------------

async function importSessionKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  // Wrap in a fresh Uint8Array to satisfy WebCrypto's ArrayBuffer (not ArrayBufferLike) constraint
  return crypto.subtle.importKey("raw", new Uint8Array(keyBytes), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptForDataChannel(
  plaintext: Uint8Array,
  key: CryptoKey,
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // Wrap plaintext for the same ArrayBufferLike → ArrayBuffer reason
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new Uint8Array(plaintext));
  // Prepend 12-byte IV so receiver can decrypt
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return out.buffer;
}

async function decryptFromDataChannel(
  ciphertext: ArrayBuffer,
  key: CryptoKey,
): Promise<Uint8Array> {
  const buf = new Uint8Array(ciphertext);
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new Uint8Array(pt);
}

// Poll /api/pairing/approval until approved, declined, or 90s timeout.
// Returns true = approved (or timed out = auto-proceed), false = declined.
async function pollForApproval(backendOrigin: string, sessionId: string): Promise<boolean> {
  const deadline = Date.now() + 92_000; // slightly over the 90s agent timeout
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(
        `${backendOrigin}/api/pairing/approval?sessionId=${encodeURIComponent(sessionId)}`,
        { cache: "no-store", signal: AbortSignal.timeout(4_000) },
      );
      if (resp.ok) {
        const json = (await resp.json()) as {
          ok: boolean;
          data?: { status: "pending" | "approved" | "declined" };
        };
        if (json.ok && json.data?.status === "approved") return true;
        if (json.ok && json.data?.status === "declined") return false;
        // "pending" or 404 → keep polling
      }
    } catch { /* transient — keep polling */ }
    await new Promise<void>((r) => setTimeout(r, 2_000));
  }
  // Timed out — agent will auto-approve after 90s, so proceed
  return true;
}

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export default function ControlPage() {
  const [connState, setConnState] = useState<ConnectionState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [resolution, setResolution] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [connectionMode, setConnectionMode] = useState<
    "direct" | "relay" | "unknown"
  >("unknown");

  const [showKeyboard, setShowKeyboard] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [heldModifiers, setHeldModifiers] = useState<Set<string>>(new Set());
  const [videoReceived, setVideoReceived] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  const sessionCryptoKeyRef = useRef<CryptoKey | null>(null);
  const reconnectAttemptRef = useRef(0);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollActiveRef = useRef(false);
  const keyboardInputRef = useRef<HTMLInputElement>(null);
  // ICE candidates that arrived before remoteDescription was set — drained after setRemoteDescription
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  // Stable ref to connectSignaling so scheduleReconnect's setTimeout always calls the latest version
  // without needing connectSignaling in its own dependency array (which would cause infinite re-creation)
  const connectSignalingRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // Stable ref to sendSignal so handleSignalingMessage can call it without needing it in its dep array
  // (which would cause an infinite re-creation cycle: handleSignalingMessage → sendSignal → handleSignalingMessage)
  const sendSignalRef = useRef<(recipient: "laptop" | "phone", payload: unknown) => Promise<void>>(
    () => Promise.resolve(),
  );

  // Load session from storage, import session key, and connect
  useEffect(() => {
    const stored = sessionStorage.getItem("td:session");
    if (!stored) {
      setError("No active session. Please scan the QR code again.");
      setConnState("error");
      return;
    }

    async function init() {
      try {
        const info = JSON.parse(stored!) as SessionInfo;
        sessionRef.current = info;

        // Import AES-256-GCM session key (Section 10.2 step 7)
        const keyBytes = fromBase64Url(info.sessionKeyB64);
        sessionCryptoKeyRef.current = await importSessionKey(keyBytes);

        // Poll the approval endpoint — show "waiting for approval" until the
        // laptop user approves or declines (or until 90s elapses = auto-approve).
        setConnState("awaiting-approval");
        const approved = await pollForApproval(info.backendOrigin, info.sessionId);
        if (!approved) {
          setError("Connection was declined by the laptop. Please scan the QR code again.");
          setConnState("error");
          return;
        }

        setConnState("connecting");
        await initWebRTC();
        void connectSignaling();
      } catch {
        setError("Session data corrupted. Please re-pair.");
        setConnState("error");
      }
    }

    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Signaling: WebSocket primary + polling fallback (Section 7.3)
  // -------------------------------------------------------------------------

  const connectSignaling = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;

    // Pass token via Sec-WebSocket-Protocol header subprotocol trick
    // (query-param is a known security anti-pattern — tokens in URLs end up in
    // server logs; use the subprotocol field which WS spec requires servers to echo,
    // giving us a standards-compliant auth channel)
    const wsUrl = `${session.backendOrigin.replace(/^http/, "ws")}/api/signal`;
    const wsProtocol = `bearer.${session.bearerToken}`;

    let wsConnected = false;
    let wsFailCount = 0;

    try {
      const ws = new WebSocket(wsUrl, [wsProtocol]);
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("WS connect timeout"));
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);
          wsConnected = true;
          reconnectAttemptRef.current = 0;
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          wsFailCount++;
          reject(new Error("WS error"));
        };
      });

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string) as Record<string, unknown>;
          // Guard against server ACK responses ({ ok: true }) and error responses
          // ({ error: ... }) that don't carry a signaling payload type field.
          if (typeof msg["t"] !== "string") return;
          void handleSignalingMessage(msg as { t: string } & Record<string, unknown>);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (wsConnected) scheduleReconnect();
      };
      // BUG-C: do NOT call initWebRTC() here — it was already called in init() before
      // connectSignaling(). Calling it again creates a second RTCPeerConnection that
      // overwrites peerRef.current while the first one still has live event handlers,
      // causing ICE candidates and SDP answers to be applied to an orphaned connection.
    } catch {
      // Fall back to polling after 2 WS failures (Section 7.3)
      if (wsFailCount >= 2 || !wsConnected) {
        void connectPolling();
      } else {
        void connectSignaling();
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connectPolling = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || pollActiveRef.current) return;

    pollActiveRef.current = true;
    reconnectAttemptRef.current = 0;
    setConnState("connecting");
    // BUG-C (polling path): do NOT call initWebRTC() here — RTCPeerConnection was
    // already created in init() before connectSignaling(). Calling it again via
    // the polling fallback path creates a second orphaned peer connection.

    const poll = async () => {
      if (!sessionRef.current || !pollActiveRef.current) return;
      try {
        const resp = await fetch(
          `${session.backendOrigin}/api/signal/poll?sessionId=${encodeURIComponent(session.sessionId)}&recipient=phone`,
          { headers: { Authorization: `Bearer ${session.bearerToken}` } },
        );
        if (resp.ok) {
          reconnectAttemptRef.current = 0;
          const result = (await resp.json()) as {
            ok: boolean;
            data: unknown[];
          };
          if (result.ok) {
            for (const msg of result.data) {
              void handleSignalingMessage(
                msg as { t: string } & Record<string, unknown>,
              );
            }
          }
        }
      } catch {
        // ignore transient poll errors
      }
      setTimeout(poll, 1000);
    };
    void poll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep sendSignalRef pointing at the latest sendSignal (defined below) so
  // handleSignalingMessage can call it without adding it to its dep array,
  // which would create an infinite re-creation cycle.
  useEffect(() => {
    connectSignalingRef.current = connectSignaling;
  }, [connectSignaling]);

  // -------------------------------------------------------------------------
  // Signaling message dispatch
  // -------------------------------------------------------------------------

  const handleSignalingMessage = useCallback(
    async (msg: { t: string } & Record<string, unknown>) => {
      const pc = peerRef.current;
      if (!pc) return;

      if (msg.t === "sdp-offer") {
        await pc.setRemoteDescription(
          new RTCSessionDescription({
            type: "offer",
            sdp: msg.sdp as string,
          }),
        );
        // Drain any ICE candidates that arrived before the remote description was set
        for (const candidate of iceCandidateQueueRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        iceCandidateQueueRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        void sendSignalRef.current("laptop", { t: "sdp-answer", sdp: answer.sdp ?? "" });
      } else if (msg.t === "sdp-answer") {
        await pc.setRemoteDescription(
          new RTCSessionDescription({
            type: "answer",
            sdp: msg.sdp as string,
          }),
        );
        // Drain any ICE candidates that arrived before the remote description was set
        for (const candidate of iceCandidateQueueRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        iceCandidateQueueRef.current = [];
      } else if (msg.t === "ice-candidate") {
        const candidateInit: RTCIceCandidateInit = {
          candidate: msg.candidate as string,
          sdpMid: msg.sdpMid as string | null,
          sdpMLineIndex: msg.sdpMLineIndex as number | null,
        };
        // Queue the candidate if remoteDescription is not yet set
        if (!pc.remoteDescription) {
          iceCandidateQueueRef.current.push(candidateInit);
        } else {
          await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
        }
      }
    },
    [],
  );

  const sendSignal = useCallback(
    async (recipient: "laptop" | "phone", payload: unknown) => {
      const session = sessionRef.current;
      if (!session) return;

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ recipient, payload }));
        return;
      }

      // Fall back to POST
      // BUG-P-SENDSIGNAL-ERR: check resp.ok and log on failure so dropped
      // signaling messages (e.g. ICE candidates) are visible in devtools
      // rather than silently discarded.
      const resp = await fetch(`${session.backendOrigin}/api/signal/poll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.bearerToken}`,
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          recipient,
          payload,
        }),
      });
      if (!resp.ok) {
        console.warn(`sendSignal POST fallback failed: HTTP ${resp.status}`);
      }
    },
    [],
  );

  // Keep sendSignalRef pointing at the latest sendSignal so handleSignalingMessage
  // can call it without adding it to its dep array (which would create a cycle).
  useEffect(() => {
    sendSignalRef.current = sendSignal;
  }, [sendSignal]);

  // -------------------------------------------------------------------------
  // WebRTC peer connection
  // -------------------------------------------------------------------------

  const initWebRTC = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;

    const iceServers: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];

    // Wire in TURN if configured
    // NOTE (S-5): NEXT_PUBLIC_ env vars are embedded in the client bundle by Next.js.
    // This is intentional — WebRTC ICE requires the client to have TURN credentials at
    // connection time. The credentials are ephemeral (short TTL) and scoped to relay-only.
    // Server-side credential rotation (via /api/turn-credentials) should replace this in
    // production to avoid long-lived credentials in the bundle.
    const turnUrl = process.env["NEXT_PUBLIC_TURN_URL"];
    const turnUsername = process.env["NEXT_PUBLIC_TURN_USERNAME"];
    const turnCredential = process.env["NEXT_PUBLIC_TURN_CREDENTIAL"];
    if (turnUrl && turnUsername && turnCredential) {
      iceServers.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
    }

    const pc = new RTCPeerConnection({ iceServers });
    peerRef.current = pc;

    // Trickle ICE — send candidates as gathered (Section 12.2)
    pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        void sendSignal("laptop", {
          t: "ice-candidate",
          candidate: evt.candidate.candidate,
          sdpMid: evt.candidate.sdpMid,
          sdpMLineIndex: evt.candidate.sdpMLineIndex,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setConnState("connected");
        // Detect relay vs direct (FR-4 connection quality indicator)
        void pc.getStats().then((stats) => {
          stats.forEach((report) => {
            if (
              report.type === "candidate-pair" &&
              (report as unknown as Record<string, unknown>)["state"] === "succeeded"
            ) {
              setConnectionMode(
                (report as unknown as Record<string, unknown>)["remoteCandidateType"] === "relay"
                  ? "relay"
                  : "direct",
              );
            }
          });
        });
      } else if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        // FR-8: distinguish no-TURN ICE failure from other failures
        if (pc.iceConnectionState === "failed") {
          const noTurn = !turnUrl;
          setError(
            noTurn
              ? "Could not establish a direct connection. Some networks require a relay. " +
                "See docs/runbooks/nat-traversal.md to enable an optional TURN relay."
              : "Connection failed despite TURN relay. Check relay credentials.",
          );
        }
        scheduleReconnect();
      }
    };

    // Screen video track (Section 8).
    // BUG-V1: evt.streams[0] can be undefined in some WebRTC implementations
    // (e.g. @roamhq/wrtc calling addTrack without explicit stream arg).
    // Fall back to constructing a MediaStream from the track itself so the
    // phone always receives video instead of a black screen.
    pc.ontrack = (evt) => {
      if (!videoRef.current) return;
      const stream = evt.streams[0] ?? new MediaStream([evt.track]);
      videoRef.current.srcObject = stream;
      setVideoReceived(true);
    };

    // Reset video flag on new connection
    setVideoReceived(false);

    // Data channel — application-layer AES-256-GCM encrypted (Section 10.2 step 7)
    pc.ondatachannel = (evt) => {
      const dc = evt.channel;
      dataChannelRef.current = dc;

      dc.onmessage = async (e) => {
        try {
          const key = sessionCryptoKeyRef.current;
          let data: string;

          if (key && e.data instanceof ArrayBuffer) {
            // Decrypt AES-256-GCM envelope
            const plaintext = await decryptFromDataChannel(e.data, key);
            data = new TextDecoder().decode(plaintext);
          } else {
            data = e.data as string;
          }

          const msg = JSON.parse(data) as ControlMessage;
          if (msg.t === "heartbeat") {
            const rtt = Date.now() - msg.ts;
            setLatency(rtt);
          } else if (msg.t === "resolutionChanged") {
            setResolution({ width: msg.width, height: msg.height });
          }
        } catch {
          // ignore malformed messages
        }
      };
    };
  }, [sendSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Reconnect state machine (Section 17)
  // -------------------------------------------------------------------------

  const scheduleReconnect = useCallback(() => {
    const attempt = reconnectAttemptRef.current++;
    if (attempt > 10) {
      setConnState("error");
      setError("Could not reconnect after 10 attempts. Please re-pair.");
      return;
    }
    setConnState("reconnecting");
    // Exponential backoff capped at 30s with ±25% jitter (Section 3 NFR).
    // BUG-P-JITTER-CAP: also cap the final jittered value at 30 000ms so the
    // ±25% upward jitter on max-backoff doesn't exceed the documented cap.
    const base = Math.min(30_000, 500 * Math.pow(2, attempt));
    const jitter = Math.min(30_000, base * (0.75 + Math.random() * 0.5));
    setTimeout(() => void connectSignalingRef.current(), jitter);
  }, []);

  // Heartbeat loop (Section 10.4)
  useEffect(() => {
    heartbeatRef.current = setInterval(async () => {
      const dc = dataChannelRef.current;
      const key = sessionCryptoKeyRef.current;
      if (!dc || dc.readyState !== "open") return;

      const msg: ControlMessage = { t: "heartbeat", ts: Date.now() };
      const encoded = new TextEncoder().encode(JSON.stringify(msg));

      if (key) {
        const encrypted = await encryptForDataChannel(encoded, key);
        // Re-check readyState after the async encrypt — the channel may have
        // closed while we were waiting (TOCTOU: Bug J fix).
        if (dc.readyState !== "open") return;
        dc.send(encrypted);
      } else {
        dc.send(JSON.stringify(msg));
      }
    }, 5000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  // Show a hint if connected but no video frames arrive within 8 seconds
  const [showVideoHint, setShowVideoHint] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (connState === "connected" && !videoReceived) {
      timer = setTimeout(() => {
        setShowVideoHint(true);
      }, 8_000);
    } else {
      setShowVideoHint(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [connState, videoReceived]);

  // -------------------------------------------------------------------------
  // Input event forwarding (Section 8 / Section 12.5)
  // -------------------------------------------------------------------------

  const sendEncryptedInput = useCallback(async (event: InputEvent) => {
    const dc = dataChannelRef.current;
    const key = sessionCryptoKeyRef.current;
    if (!dc || dc.readyState !== "open") return;

    // Wrap in a fresh Uint8Array to guarantee ArrayBuffer (not ArrayBufferLike)
    // so the RTCDataChannel.send() overload matches (TS2769).
    const encoded = new Uint8Array(encodeInputEvent(event));
    if (key) {
      const encrypted = await encryptForDataChannel(encoded, key);
      // BUG-P-DC-RECHECK: re-check readyState after the async encrypt — the
      // data channel may have closed while we were waiting (TOCTOU).
      if (dc.readyState !== "open") return;
      dc.send(encrypted);
    } else {
      dc.send(encoded);
    }
  }, []);

  const handlePointer = useCallback(
    (e: React.PointerEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const res = resolution ?? { width: 1920, height: 1080 };
      const x = Math.round(((e.clientX - rect.left) / rect.width) * res.width);
      const y = Math.round(
        ((e.clientY - rect.top) / rect.height) * res.height,
      );
      const event: InputEvent = {
        t: "pointer",
        x,
        y,
        buttons: e.buttons,
        ts: Date.now(),
      };
      void sendEncryptedInput(event);
      e.preventDefault();
    },
    [resolution, sendEncryptedInput],
  );


  const handleScroll = useCallback(
    (e: React.WheelEvent) => {
      const event: InputEvent = {
        t: "scroll",
        dx: e.deltaX,
        dy: e.deltaY,
        ts: Date.now(),
      };
      void sendEncryptedInput(event);
      e.preventDefault();
    },
    [sendEncryptedInput],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      const event: InputEvent = {
        t: "key",
        code: e.code,
        down: e.type === "keydown",
        ts: Date.now(),
      };
      void sendEncryptedInput(event);
      e.preventDefault();
    },
    [sendEncryptedInput],
  );

  const toggleModifier = useCallback((code: string) => {
    const isHeld = heldModifiers.has(code);
    void sendEncryptedInput({ t: "key", code, down: !isHeld, ts: Date.now() });
    setHeldModifiers((prev) => {
      const next = new Set(prev);
      if (isHeld) next.delete(code); else next.add(code);
      return next;
    });
  }, [heldModifiers, sendEncryptedInput]);

  const tapKey = useCallback((code: string) => {
    void sendEncryptedInput({ t: "key", code, down: true, ts: Date.now() });
    setTimeout(() => {
      void sendEncryptedInput({ t: "key", code, down: false, ts: Date.now() });
    }, 60);
  }, [sendEncryptedInput]);

  const handleKeyboardFieldKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const event: InputEvent = { t: "key", code: e.code, down: true, ts: Date.now() };
    void sendEncryptedInput(event);
    // Send keyup on next tick so the remote sees both down and up
    setTimeout(() => {
      void sendEncryptedInput({ ...event, down: false });
    }, 60);
    // Do NOT preventDefault — let the input field update its value
  }, [sendEncryptedInput]);

  const clearHeldModifiers = useCallback(() => {
    for (const code of heldModifiers) {
      void sendEncryptedInput({ t: "key", code, down: false, ts: Date.now() });
    }
    setHeldModifiers(new Set());
  }, [heldModifiers, sendEncryptedInput]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollActiveRef.current = false;
      wsRef.current?.close();
      peerRef.current?.close();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (connState === "loading" || connState === "connecting") {
    return (
      <LoadingScreen
        message={
          connState === "loading" ? "Loading session…" : "Connecting to laptop…"
        }
      />
    );
  }

  if (connState === "awaiting-approval") {
    return (
      <div style={styles.centeredPage} role="status" aria-live="polite">
        <div style={styles.logoText}>TetherDesk</div>
        <div style={styles.spinner} aria-hidden="true" />
        <p style={styles.loadingLabel}>Waiting for laptop approval…</p>
        <p style={{ color: "#666", fontSize: 13, margin: "8px 0 0", textAlign: "center", maxWidth: 260 }}>
          Check the TetherDesk window on your laptop and click <strong style={{ color: "#f0f0f0" }}>Allow</strong> to continue.
        </p>
      </div>
    );
  }

  if (connState === "error") {
    return (
      <ErrorScreen
        message={error ?? "Connection failed."}
        onRetry={() => {
          setConnState("connecting");
          setError(null);
          reconnectAttemptRef.current = 0;
          void connectSignaling();
        }}
      />
    );
  }

  return (
    <div
      style={styles.root}
      tabIndex={0}
      onKeyDown={handleKey}
      onKeyUp={handleKey}
      aria-label="Remote laptop control surface"
    >
      {/* Status bar */}
      <div style={styles.statusBar}>
        <span
          style={{
            ...styles.statusDot,
            background: connState === "connected" ? "#4ade80" : "#facc15",
          }}
          aria-hidden="true"
        />
        <span style={styles.statusText}>
          {connState === "connected"
            ? "Connected"
            : connState === "reconnecting"
              ? "Reconnecting…"
              : "Connecting…"}
        </span>
        {latency !== null && (
          <span style={styles.statusText}>{latency}ms</span>
        )}
        <span style={{ ...styles.statusText, marginLeft: "auto" }}>
          {connectionMode === "direct"
            ? "Direct P2P"
            : connectionMode === "relay"
              ? "Via relay"
              : ""}
        </span>
      </div>

      {/* Remote screen video */}
      <video
        ref={videoRef}
        style={{
          ...styles.video,
          objectFit: isZoomed ? "cover" : "contain",
        }}
        autoPlay
        playsInline
        muted
        onPointerDown={handlePointer}
        onPointerMove={handlePointer}
        onPointerUp={handlePointer}
        onWheel={handleScroll}
        aria-label="Remote laptop screen"
      />

      {connState === "reconnecting" && (
        <div style={styles.overlay} role="status" aria-live="polite">
          <p style={styles.overlayText}>Reconnecting…</p>
        </div>
      )}

      {/* No video hint — data channel works but video not received after 8s */}
      {connState === "connected" && showVideoHint && (
        <div style={styles.videoHint}>
          <span style={{ fontSize: 13, color: "#fbbf24" }}>&#9888;</span>
          <span style={styles.videoHintText}>
            Connected but no video — ensure the TetherDesk agent is running on the laptop ({" "}
            <code style={{ color: "#4ade80", fontSize: 11 }}>npx tetherdesk</code>
            {" "}) and check the terminal for errors.
          </span>
        </div>
      )}

      {/* Keyboard input field */}
      {showKeyboard && (
        <div style={styles.keyboardContainer}>
          <input
            ref={keyboardInputRef}
            type="text"
            autoFocus
            placeholder="Type here — keystrokes sent to remote laptop"
            style={styles.keyboardInput}
            onKeyDown={handleKeyboardFieldKeyDown}
            aria-label="Keyboard input for remote laptop"
          />
          <button
            className="btn-secondary"
            style={styles.keyboardCloseBtn}
            onClick={() => { clearHeldModifiers(); setShowKeyboard(false); }}
            aria-label="Close keyboard"
          >
            ✕
          </button>
        </div>
      )}

      {/* Control toolbar */}
      <div style={styles.controlBar}>
        <button
          className="btn-secondary"
          style={{ ...styles.ctrlBtn, background: isZoomed ? "#333" : undefined }}
          onClick={() => setIsZoomed(!isZoomed)}
          aria-label={isZoomed ? "Fit to screen" : "Zoom to fill"}
        >
          {isZoomed ? "⊟ Fit" : "⊞ Zoom"}
        </button>

        <button
          className="btn-secondary"
          style={{ ...styles.ctrlBtn, background: showKeyboard ? "#333" : undefined }}
          onClick={() => { setShowKeyboard(!showKeyboard); setTimeout(() => keyboardInputRef.current?.focus(), 100); }}
          aria-label="Toggle keyboard"
        >
          ⌨
        </button>

        <div style={styles.ctrlDivider} />

        <button
          className="btn-secondary"
          style={{ ...styles.ctrlBtn, background: heldModifiers.has("ControlLeft") ? "#4a5568" : undefined }}
          onClick={() => toggleModifier("ControlLeft")}
          aria-pressed={heldModifiers.has("ControlLeft")}
        >
          {heldModifiers.has("ControlLeft") ? "Ctrl ON" : "Ctrl"}
        </button>

        <button
          className="btn-secondary"
          style={{ ...styles.ctrlBtn, background: heldModifiers.has("AltLeft") ? "#4a5568" : undefined }}
          onClick={() => toggleModifier("AltLeft")}
          aria-pressed={heldModifiers.has("AltLeft")}
        >
          {heldModifiers.has("AltLeft") ? "Alt ON" : "Alt"}
        </button>

        <button
          className="btn-secondary"
          style={{ ...styles.ctrlBtn, background: heldModifiers.has("MetaLeft") ? "#4a5568" : undefined }}
          onClick={() => toggleModifier("MetaLeft")}
          aria-pressed={heldModifiers.has("MetaLeft")}
        >
          {heldModifiers.has("MetaLeft") ? "Win ON" : "Win"}
        </button>

        <div style={styles.ctrlDivider} />

        <button className="btn-secondary" style={styles.ctrlBtn} onClick={() => tapKey("Escape")}>Esc</button>
        <button className="btn-secondary" style={styles.ctrlBtn} onClick={() => tapKey("Tab")}>Tab</button>
        <button className="btn-secondary" style={styles.ctrlBtn} onClick={() => tapKey("Enter")}>⏎</button>
        <button className="btn-secondary" style={styles.ctrlBtn} onClick={() => tapKey("Backspace")}>⌫</button>
        <button className="btn-secondary" style={styles.ctrlBtn} onClick={() => tapKey("Delete")}>Del</button>

        {heldModifiers.size > 0 && (
          <button className="btn-secondary" style={{ ...styles.ctrlBtn, color: "#fbbf24" }} onClick={clearHeldModifiers}>
            ✕ Clear
          </button>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------------

function LoadingScreen({ message }: { message: string }) {
  return (
    <div style={styles.centeredPage} role="status" aria-live="polite">
      <div style={styles.logoText}>TetherDesk</div>
      <div style={styles.spinner} aria-hidden="true" />
      <p style={styles.loadingLabel}>{message}</p>
    </div>
  );
}

function ErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div style={styles.centeredPage} role="alert">
      <div style={styles.logoText}>TetherDesk</div>
      <div style={styles.errorIcon} aria-hidden="true">
        ✕
      </div>
      <p style={styles.errorLabel}>Connection failed</p>
      <p style={styles.errorMessage}>{message}</p>
      <button className="btn-secondary" style={styles.retryButton} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

// -------------------------------------------------------------------------
// Styles
// -------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: "100dvw",
    height: "100dvh",
    background: "#000",
    display: "flex",
    flexDirection: "column",
    outline: "none",
    overflow: "hidden",
    touchAction: "none",
  },
  statusBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 12px",
    background: "#111",
    flexShrink: 0,
    height: 32,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  statusText: {
    fontSize: 11,
    color: "#aaa",
  },
  video: {
    flex: 1,
    width: "100%",
    objectFit: "contain",
    background: "#000",
    display: "block",
    touchAction: "none",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.5)",
    pointerEvents: "none",
  },
  overlayText: {
    color: "#fff",
    fontSize: 16,
  },
  centeredPage: {
    width: "100dvw",
    height: "100dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    background: "#0a0a0a",
    color: "#f0f0f0",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  logoText: {
    fontSize: 20,
    fontWeight: 700,
    color: "#4ade80",
    marginBottom: 8,
  },
  spinner: {
    width: 36,
    height: 36,
    border: "3px solid #2a2a2a",
    borderTopColor: "#4ade80",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingLabel: {
    fontSize: 15,
    color: "#888",
    margin: 0,
  },
  errorIcon: {
    fontSize: 36,
    color: "#f87171",
  },
  errorLabel: {
    fontSize: 17,
    fontWeight: 600,
    margin: 0,
  },
  errorMessage: {
    fontSize: 14,
    color: "#f87171",
    textAlign: "center",
    maxWidth: 300,
    margin: 0,
    lineHeight: 1.5,
  },
  retryButton: {
    background: "#2a2a2a",
    color: "#f0f0f0",
    border: "1px solid #3a3a3a",
    borderRadius: 8,
    padding: "10px 24px",
    fontSize: 14,
    cursor: "pointer",
    marginTop: 8,
  },
  controlBar: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 8px",
    background: "#1a1a1a",
    flexShrink: 0,
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    minHeight: 40,
  },
  ctrlBtn: {
    background: "#2a2a2a",
    color: "#ccc",
    border: "1px solid #3a3a3a",
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: 11,
    cursor: "pointer",
    whiteSpace: "nowrap",
    minHeight: 28,
    minWidth: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlDivider: {
    width: 1,
    height: 20,
    background: "#333",
    flexShrink: 0,
    margin: "0 2px",
  },
  keyboardContainer: {
    display: "flex",
    gap: 4,
    padding: "6px 8px",
    background: "#111",
    flexShrink: 0,
    alignItems: "center",
  },
  keyboardInput: {
    flex: 1,
    background: "#222",
    color: "#f0f0f0",
    border: "1px solid #444",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 14,
    outline: "none",
    minHeight: 36,
  },
  keyboardCloseBtn: {
    background: "#333",
    color: "#aaa",
    border: "1px solid #444",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 14,
    cursor: "pointer",
    minHeight: 36,
  },
  videoHint: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    background: "#1a0f00",
    flexShrink: 0,
  },
  videoHintText: {
    fontSize: 11,
    color: "#d97706",
    lineHeight: 1.4,
  },
};
