/**
 * WebRTC peer connection manager for the laptop agent (Section 12).
 *
 * Responsible for:
 * - Creating the RTCPeerConnection with STUN/TURN ICE servers
 * - Adding the screen video MediaStreamTrack (with a proper MediaStream wrapper)
 * - Creating the input data channel
 * - Generating SDP offers and handling SDP answers
 * - Trickle-ICE candidate exchange via the signaling mailbox
 * - Reconnect on ICE failure
 *
 * Node.js WebRTC implementation:
 * This module loads @roamhq/wrtc at runtime if available. That package provides
 * RTCPeerConnection, MediaStream, and MediaStreamTrack as Node.js globals.
 * If it is not installed (e.g. in unit tests or CI without native addons), the
 * module falls back to a no-op stub that allows typecheck/import to succeed while
 * making the missing dependency obvious at the point of first use, not at import time.
 *
 * To enable real WebRTC: pnpm add @roamhq/wrtc (already in package.json optionalDependencies)
 */

import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const _require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Helper: try to resolve @roamhq/wrtc from multiple locations
// ---------------------------------------------------------------------------

type WrtcModule = {
  RTCPeerConnection: new (cfg?: RTCConfiguration) => RTCPeerConnection;
  MediaStream: new () => { addTrack(t: MediaStreamTrack): void };
  nonstandard?: { RTCVideoSource: new () => { createTrack(): MediaStreamTrack; onFrame(f: { width: number; height: number; data: Uint8ClampedArray }): void } };
};

export function tryRequireWrtc(): WrtcModule | null {
  // 1. Try local/bundle node_modules
  try {
    return _require("@roamhq/wrtc") as WrtcModule;
  } catch { /* ignore */ }

  // 2. Try global npm path (Windows)
  const globalPaths = [
    process.platform === "win32"
      ? join(process.env.APPDATA || "", "npm", "node_modules", "@roamhq", "wrtc")
      : join(homedir(), ".npm-global", "node_modules", "@roamhq", "wrtc"),
    // 3. Try npm global root
    join(process.execPath.replace(/\\node\.exe$/i, ""), "..", "lib", "node_modules", "@roamhq", "wrtc"),
  ];

  for (const p of globalPaths) {
    try {
      return _require(p) as WrtcModule;
    } catch { /* ignore */ }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Load @roamhq/wrtc in Node.js environment
// ---------------------------------------------------------------------------

let _RTCPeerConnection: (new (cfg?: RTCConfiguration) => RTCPeerConnection) | null = null;
let _MediaStream: (new () => { addTrack(t: MediaStreamTrack): void }) | null = null;

try {
  const wrtc = tryRequireWrtc();
  if (wrtc) {
    _RTCPeerConnection = wrtc.RTCPeerConnection;
    _MediaStream = wrtc.MediaStream;
  }
} catch {
  // @roamhq/wrtc not installed — peer connections will throw at createOffer()
  // with a clear message rather than a mysterious "RTCPeerConnection is not defined".
}

function getRTCPeerConnection(): new (cfg?: RTCConfiguration) => RTCPeerConnection {
  if (!_RTCPeerConnection) {
    throw new Error(
      "@roamhq/wrtc is not installed. Run: pnpm add @roamhq/wrtc\n" +
        "This native module provides WebRTC support for the Node.js agent.",
    );
  }
  return _RTCPeerConnection;
}

function createMediaStream(track: MediaStreamTrack): { addTrack(t: MediaStreamTrack): void } {
  if (!_MediaStream) {
    throw new Error(
      "@roamhq/wrtc is not installed. Run: pnpm add @roamhq/wrtc",
    );
  }
  const stream = new _MediaStream();
  stream.addTrack(track);
  return stream;
}

// ---------------------------------------------------------------------------

export interface PeerConfig {
  iceServers: RTCIceServer[];
  /** Called when a local ICE candidate is ready to send to the remote peer. */
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  /** Called when the data channel receives a message from the phone. */
  onDataChannelMessage: (data: ArrayBuffer | string) => void;
  /** Called when the ICE/connection state changes. */
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
}

export type PeerConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

/**
 * Default STUN servers — purely stateless address-discovery, no privacy burden
 * beyond revealing the device's public IP (Section 12.3).
 */
export const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export class AgentPeer {
  private config: PeerConfig;
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  // BUG-13: queue ICE candidates that arrive before remoteDescription is set
  private iceCandidateQueue: RTCIceCandidateInit[] = [];

  constructor(config: PeerConfig) {
    this.config = config;
  }

  // -------------------------------------------------------------------------
  // Offer / answer lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create an RTCPeerConnection with a data channel only (no video track).
   * Used as fallback when screen capture is unavailable or @roamhq/wrtc
   * does not provide RTCVideoSource. The phone can still send input events
   * and receive control messages; it just won't receive a video stream.
   */
  async createOfferDataOnly(): Promise<RTCSessionDescriptionInit> {
    const PeerConnection = getRTCPeerConnection();
    this.pc = new PeerConnection({ iceServers: this.config.iceServers });

    this._wireConnectionHandlers();

    // Data channel only — no video track
    this.dataChannel = this.pc.createDataChannel("td-control", {
      ordered: true,
    });
    this._wireDataChannelHandlers(this.dataChannel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /**
   * Create an RTCPeerConnection, attach the video track inside a MediaStream,
   * open the data channel, and return an SDP offer to send to the phone via signaling.
   *
   * The MediaStream wrapper is required by the WebRTC spec: addTrack() requires a
   * stream argument so the remote peer can group related tracks. Without it,
   * some implementations (including @roamhq/wrtc) silently drop the track.
   */
  async createOffer(videoTrack: MediaStreamTrack): Promise<RTCSessionDescriptionInit> {
    const PeerConnection = getRTCPeerConnection();
    this.pc = new PeerConnection({ iceServers: this.config.iceServers });

    this._wireConnectionHandlers();

    // Wrap track in a MediaStream — required by spec and wrtc implementation
    const stream = createMediaStream(videoTrack);
    this.pc.addTrack(videoTrack, stream as unknown as MediaStream);

    // Ordered, reliable data channel for input events and control messages
    this.dataChannel = this.pc.createDataChannel("td-control", {
      ordered: true,
    });
    this._wireDataChannelHandlers(this.dataChannel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /**
   * Apply the SDP answer received from the phone via signaling.
   * BUG-13: drain the ICE candidate queue after setting remote description.
   */
  async applyAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error("No active peer connection");
    await this.pc.setRemoteDescription(answer);
    await this._drainIceCandidateQueue();
  }

  /**
   * Add a remote ICE candidate received from the phone via signaling (Trickle ICE).
   * BUG-13: queue candidates if remoteDescription is not yet set.
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) throw new Error("No active peer connection");
    if (!this.pc.remoteDescription) {
      // Candidate arrived before setRemoteDescription — queue it
      this.iceCandidateQueue.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(candidate);
  }

  // Drain the ICE candidate queue after setRemoteDescription
  private async _drainIceCandidateQueue(): Promise<void> {
    const queued = this.iceCandidateQueue.splice(0);
    for (const candidate of queued) {
      await this.pc!.addIceCandidate(candidate);
    }
  }

  // -------------------------------------------------------------------------
  // Data channel send
  // -------------------------------------------------------------------------

  /**
   * Send a binary-encoded message (input event or control message) to the phone.
   */
  send(data: ArrayBuffer | string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      throw new Error("Data channel not open");
    }
    // BUG-12: do NOT cast ArrayBuffer to string — that corrupts binary input events.
    // RTCDataChannel.send() has overloads for string, ArrayBuffer, and ArrayBufferView.
    // @roamhq/wrtc's implementation accepts Buffer/ArrayBuffer natively at runtime;
    // we use Uint8Array (an ArrayBufferView) as the runtime type, which both the TS
    // compiler and wrtc accept without unsafe casts.
    if (typeof data === "string") {
      this.dataChannel.send(data);
    } else {
      this.dataChannel.send(new Uint8Array(data));
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  getConnectionState(): PeerConnectionState {
    return (this.pc?.connectionState ?? "new") as PeerConnectionState;
  }

  close(): void {
    this.dataChannel?.close();
    this.pc?.close();
    this.pc = null;
    this.dataChannel = null;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _wireConnectionHandlers(): void {
    const pc = this.pc!;

    // Trickle ICE — send candidates as they are gathered (Section 12.2)
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.config.onIceCandidate(event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      this.config.onConnectionStateChange(pc.connectionState as RTCPeerConnectionState);
    };

    // Remote data channel opened by phone (shouldn't happen — laptop is the offerer —
    // but guard against it to avoid silent drops)
    pc.ondatachannel = (event) => {
      this._wireDataChannelHandlers(event.channel);
    };
  }

  private _wireDataChannelHandlers(channel: RTCDataChannel): void {
    channel.onmessage = (event) => {
      this.config.onDataChannelMessage(event.data as ArrayBuffer | string);
    };
  }
}
