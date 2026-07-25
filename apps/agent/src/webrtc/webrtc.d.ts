/**
 * Minimal WebRTC type declarations for the laptop agent (Node.js environment).
 *
 * The agent runs in Node.js which does not have browser WebRTC globals.
 * In production (Phase 2+), a Node WebRTC binding such as @roamhq/wrtc is used,
 * which provides these globals at runtime. These declarations give TypeScript
 * the type information it needs to typecheck peer.ts without pulling in the
 * full browser DOM lib (which conflicts with the Node.js type environment).
 *
 * Only the surface used by AgentPeer is declared here — no unused members.
 */

declare interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

declare interface RTCSessionDescriptionInit {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
}

declare interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

declare interface RTCConfiguration {
  iceServers?: RTCIceServer[];
  iceTransportPolicy?: "all" | "relay";
  bundlePolicy?: "balanced" | "max-bundle" | "max-compat";
  rtcpMuxPolicy?: "require";
}

declare interface RTCDataChannelInit {
  ordered?: boolean;
  maxPacketLifeTime?: number;
  maxRetransmits?: number;
  protocol?: string;
  negotiated?: boolean;
  id?: number;
}

declare type RTCDataChannelState = "connecting" | "open" | "closing" | "closed";
declare type RTCPeerConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";
declare type RTCIceConnectionState =
  | "new"
  | "checking"
  | "connected"
  | "completed"
  | "failed"
  | "disconnected"
  | "closed";
declare type RTCSignalingState =
  | "stable"
  | "have-local-offer"
  | "have-remote-offer"
  | "have-local-pranswer"
  | "have-remote-pranswer"
  | "closed";

declare interface RTCIceCandidateEvent {
  candidate: RTCIceCandidate | null;
}

declare interface RTCIceCandidate {
  toJSON(): RTCIceCandidateInit;
}

declare interface RTCDataChannelEvent {
  channel: RTCDataChannel;
}

declare interface MessageEvent<T = unknown> {
  data: T;
}

declare interface RTCDataChannel {
  readonly readyState: RTCDataChannelState;
  readonly label: string;
  onmessage: ((event: MessageEvent) => void) | null;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string | ArrayBuffer | ArrayBufferView | Blob): void;
  close(): void;
}

declare interface MediaStream {
  addTrack(track: MediaStreamTrack): void;
  removeTrack(track: MediaStreamTrack): void;
  getTracks(): MediaStreamTrack[];
}

declare const MediaStream: {
  new (): MediaStream;
};

declare interface MediaStreamTrack {
  readonly kind: string;
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly readyState: "live" | "ended";
  stop(): void;
}

declare interface RTCRtpSender {
  readonly track: MediaStreamTrack | null;
}

declare interface RTCPeerConnection {
  readonly connectionState: RTCPeerConnectionState;
  readonly iceConnectionState: RTCIceConnectionState;
  readonly signalingState: RTCSignalingState;
  readonly remoteDescription: RTCSessionDescriptionInit | null;
  onicecandidate: ((event: RTCIceCandidateEvent) => void) | null;
  onconnectionstatechange: (() => void) | null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  addTrack(track: MediaStreamTrack, ...streams: unknown[]): RTCRtpSender;
  createDataChannel(label: string, init?: RTCDataChannelInit): RTCDataChannel;
  close(): void;
}

declare const RTCPeerConnection: {
  new (configuration?: RTCConfiguration): RTCPeerConnection;
};
