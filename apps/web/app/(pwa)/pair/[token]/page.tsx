"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  generateX25519KeyPair,
  deriveSharedSecret,
  toBase64Url,
  fromBase64Url,
  deriveSessionKey,
} from "@tetherdesk/crypto";
import { decodePairingQrPayload, type PairingQrPayload } from "@tetherdesk/protocol";

// jsQR is loaded dynamically to avoid SSR issues with canvas APIs
type JsQR = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;

type PairingState =
  | { phase: "scan" }           // camera scan mode (entry point when no token in URL)
  | { phase: "loading" }        // decoding URL token
  | { phase: "confirming" }     // handshaking with backend
  | { phase: "error"; message: string }
  | { phase: "done"; sessionId: string; bearerToken: string };

// ---------------------------------------------------------------------------
// QR decode helpers
// ---------------------------------------------------------------------------

/** Try BarcodeDetector API (Chrome/Android); returns null if unavailable */
async function decodeBarcodeDetector(video: HTMLVideoElement): Promise<string | null> {
  if (!("BarcodeDetector" in window)) return null;
  try {
    // @ts-expect-error — BarcodeDetector is not in TS lib yet
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    const barcodes = await detector.detect(video) as Array<{ rawValue: string }>;
    return barcodes[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

/** jsQR canvas fallback */
async function decodeJsQR(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<string | null> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  try {
    const jsQR: JsQR = (await import("jsqr" as string)).default as JsQR;
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    return result?.data ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pairing handshake (shared between camera-scan and URL-token paths)
// ---------------------------------------------------------------------------

async function runPairingHandshake(
  payload: PairingQrPayload,
  setState: (s: PairingState) => void,
  router: ReturnType<typeof useRouter>,
) {
  const { backendOrigin, pairingToken, sessionId, laptopEphemeralPubKey } = payload;

  if (!backendOrigin || !pairingToken || !sessionId || !laptopEphemeralPubKey) {
    setState({ phase: "error", message: "Invalid QR code — missing required fields." });
    return;
  }

  setState({ phase: "confirming" });

  // Generate phone's ephemeral keypair for ECDH
  const phoneEphemeral = generateX25519KeyPair();

  // Derive shared secret with laptop's ephemeral key
  const laptopPubKeyBytes = fromBase64Url(laptopEphemeralPubKey);
  const rawSharedSecret = deriveSharedSecret(phoneEphemeral.secretKey, laptopPubKeyBytes);

  // Derive session key via HKDF — never transmitted
  const encoder = new TextEncoder();
  const sessionKey = deriveSessionKey(
    rawSharedSecret,
    encoder.encode(sessionId),
    "tetherdesk/session-key/v1",
  );

  // Resolve the phone's long-term public key used as a device identifier.
  // BUG-14: The secret key is NEVER stored. We only store the public key for
  // stable device recognition across pairings. The identity key is NOT used
  // in ECDH — that uses the ephemeral keypair above. It is only sent to the
  // backend as an opaque device fingerprint.
  // BUG-PP-STORAGE: use localStorage (survives browser restarts, consistent
  // across tabs) instead of sessionStorage (cleared when the tab closes).
  // A phone user who pairs, closes the browser, then re-opens it would get
  // a brand-new identity key with sessionStorage, making their device
  // unrecognisable on subsequent pairings and appearing as a new device.
  const stored = localStorage.getItem("td:identity:pk");
  let phonePubKeyBytes: Uint8Array;
  if (stored) {
    // Re-use the existing public key so the backend recognises this device.
    phonePubKeyBytes = fromBase64Url(stored);
  } else {
    // First pairing on this browser — generate a fresh identity keypair.
    // Only the public key is persisted; the secret key is discarded immediately
    // (it is never used for crypto — the ephemeral keypair handles ECDH).
    const freshIdentity = generateX25519KeyPair();
    phonePubKeyBytes = freshIdentity.publicKey;
    localStorage.setItem("td:identity:pk", toBase64Url(phonePubKeyBytes));
  }

  // BUG-PP-ORIGIN-VALIDATE: backendOrigin comes from the QR code which was
  // scanned from an untrusted surface. Reject non-HTTPS origins in production
  // to prevent a QR code printed by an attacker from directing the phone to
  // an HTTP endpoint where credentials would be sent in the clear.
  // Allow HTTP only for localhost and Cloudflare tunnel origins (.trycloudflare.com,
  // .cloudflare.com) used during development and behind-NAT setups.
  const isLocalhost = backendOrigin.startsWith("http://localhost") ||
    backendOrigin.startsWith("http://127.0.0.1");
  
  // BUG-SEC-4: Use URL parse + hostname.endsWith() instead of string.includes()
  // to prevent bypass via domains like "evil.com?trycloudflare.com" or
  // "trycloudflare.com.evil.com". Parse the URL and check that the hostname
  // actually ends with the trusted suffix.
  // 
  // H006: Only accept subdomains, not apex domains (e.g., "xxx.trycloudflare.com"
  // is valid, but "trycloudflare.com" is not a real tunnel endpoint).
  let isTunnel = false;
  try {
    const url = new URL(backendOrigin);
    isTunnel = url.hostname.endsWith(".trycloudflare.com") ||
      url.hostname.endsWith(".cloudflare.com") ||
      url.hostname.endsWith(".ngrok.io") ||
      url.hostname.endsWith(".ngrok-free.app");
  } catch {
    // Invalid URL format — treat as non-tunnel
    isTunnel = false;
  }

  const isHttps = backendOrigin.startsWith("https://");
  if (!isHttps && !isLocalhost && !isTunnel) {
    setState({ phase: "error", message: "Invalid QR code — backend origin must use HTTPS." });
    return;
  }

  // Confirm pairing with the backend.
  // BUG-PP-TIMEOUT: add a 15s timeout so a slow/unreachable backend doesn't
  // leave the pairing UI stuck indefinitely on "Confirming…".
  const resp = await fetch(`${backendOrigin}/api/pairing/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pairingToken,
      phonePubKey: toBase64Url(phonePubKeyBytes),
      phoneEphemeralPubKey: toBase64Url(phoneEphemeral.publicKey),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  // Guard against non-JSON error responses (4xx/5xx) before attempting to
  // parse — calling resp.json() on an HTML error page throws with a
  // misleading SyntaxError that hides the real HTTP status.
  if (!resp.ok) {
    setState({
      phase: "error",
      message: `Pairing request failed (HTTP ${resp.status}). Please try again.`,
    });
    return;
  }

  const result = (await resp.json()) as
    | { ok: true; data: { sessionId: string; bearerToken: string } }
    | { ok: false; error: { code: string; message: string } };

  if (!result.ok) {
    const msg =
      result.error.code === "PAIRING_TOKEN_EXPIRED"
        ? "QR code has expired. Please ask the laptop to generate a new one."
        : result.error.code === "PAIRING_TOKEN_ALREADY_USED"
          ? "This QR code has already been used. Please generate a new one."
          : `Pairing failed: ${result.error.message}`;
    setState({ phase: "error", message: msg });
    return;
  }

  // Persist session info under the key control/page.tsx expects: "td:session"
  sessionStorage.setItem(
    "td:session",
    JSON.stringify({
      backendOrigin,
      sessionId: result.data.sessionId,
      bearerToken: result.data.bearerToken,
      sessionKeyB64: toBase64Url(sessionKey),
    }),
  );

  setState({
    phase: "done",
    sessionId: result.data.sessionId,
    bearerToken: result.data.bearerToken,
  });

  router.replace("/control");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PairPage() {
  const params = useParams<{ token?: string }>();
  const router = useRouter();
  const [state, setState] = useState<PairingState>(() =>
    params.token ? { phase: "loading" } : { phase: "scan" },
  );

  // Camera scan refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const scanRafRef = useRef<number | null>(null);

  // Run URL-token path on mount (no camera needed)
  const ran = useRef(false);
  useEffect(() => {
    if (!params.token) return;
    if (ran.current) return;
    ran.current = true;

    async function runFromUrl() {
      try {
        const payload = decodePairingQrPayload(params.token!);
        await runPairingHandshake(payload, setState, router);
      } catch (err) {
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Could not decode QR payload.",
        });
      }
    }
    void runFromUrl();
  }, [params.token, router]);

  // ---------------------------------------------------------------------------
  // Camera scan path
  // ---------------------------------------------------------------------------

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (scanRafRef.current !== null) {
      cancelAnimationFrame(scanRafRef.current);
      scanRafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      scanningRef.current = true;

      const scan = async () => {
        if (!scanningRef.current) return;
        const vid = videoRef.current;
        const canvas = canvasRef.current;
        if (!vid || !canvas || vid.videoWidth === 0) {
          scanRafRef.current = requestAnimationFrame(() => void scan());
          return;
        }

        // Try BarcodeDetector first, then jsQR
        const qrData =
          (await decodeBarcodeDetector(vid)) ??
          (await decodeJsQR(vid, canvas));

        if (qrData) {
          stopCamera();
          try {
            const payload = decodePairingQrPayload(qrData);
            await runPairingHandshake(payload, setState, router);
          } catch {
            setState({ phase: "error", message: "QR code is not a valid TetherDesk pairing code." });
          }
          return;
        }

        scanRafRef.current = requestAnimationFrame(() => void scan());
      };
      void scan();
    } catch (err) {
      const msg =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access and try again."
          : err instanceof Error
            ? err.message
            : "Could not access camera.";
      setState({ phase: "error", message: msg });
    }
  }, [stopCamera, router]);

  // Start camera when entering scan phase
  useEffect(() => {
    if (state.phase === "scan") {
      void startCamera();
    }
    return () => {
      if (state.phase === "scan") stopCamera();
    };
  }, [state.phase, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), [stopCamera]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <p style={styles.logo}>TetherDesk</p>

        {state.phase === "scan" && (
          <>
            <p style={styles.label}>Scan QR code</p>
            <p style={styles.muted}>Point your camera at the QR code shown on your laptop.</p>
            <div style={styles.cameraContainer}>
              {/* Hidden canvas for jsQR fallback — never shown to user */}
              <canvas ref={canvasRef} style={{ display: "none" }} aria-hidden="true" />
              <video
                ref={videoRef}
                style={styles.cameraVideo}
                autoPlay
                playsInline
                muted
                aria-label="Camera viewfinder for QR code scanning"
              />
              <div style={styles.scanOverlay} aria-hidden="true">
                <div style={styles.scanCorner} />
              </div>
            </div>
          </>
        )}

        {state.phase === "loading" && (
          <>
            <Spinner />
            <p style={styles.label}>Opening pairing link…</p>
            <p style={styles.muted}>Verifying QR code payload</p>
          </>
        )}

        {state.phase === "confirming" && (
          <>
            <Spinner />
            <p style={styles.label}>Completing handshake…</p>
            <p style={styles.muted}>Establishing encrypted channel</p>
          </>
        )}

        {state.phase === "done" && (
          <>
            <div style={styles.checkmark} aria-hidden="true">✓</div>
            <p style={styles.label}>Paired!</p>
            <p style={styles.muted}>Opening remote control…</p>
          </>
        )}

        {state.phase === "error" && (
          <>
            <div style={styles.errorIcon} aria-hidden="true">✕</div>
            <p style={styles.label}>Pairing failed</p>
            <p style={styles.errorMessage}>{state.message}</p>
            <button
              style={styles.button}
              onClick={() => {
                stopCamera();
                setState({ phase: "scan" });
              }}
            >
              Try again
            </button>
          </>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        width: 40,
        height: 40,
        border: "3px solid #2a2a2a",
        borderTopColor: "#4ade80",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        margin: "8px auto",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0a0a",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: 24,
    width: "min(360px, 92vw)",
    textAlign: "center",
    color: "#f0f0f0",
  },
  logo: {
    fontSize: 20,
    fontWeight: 700,
    color: "#4ade80",
    marginBottom: 24,
    letterSpacing: "-0.5px",
  },
  label: {
    fontSize: 18,
    fontWeight: 600,
    margin: "8px 0 4px",
  },
  muted: {
    fontSize: 13,
    color: "#888",
    margin: 0,
  },
  cameraContainer: {
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1",
    borderRadius: 12,
    overflow: "hidden",
    background: "#111",
    marginTop: 12,
  },
  cameraVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  scanOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  scanCorner: {
    width: "55%",
    aspectRatio: "1 / 1",
    border: "2px solid #4ade80",
    borderRadius: 8,
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
  },
  checkmark: {
    fontSize: 40,
    color: "#4ade80",
    marginBottom: 8,
  },
  errorIcon: {
    fontSize: 40,
    color: "#f87171",
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: "#f87171",
    margin: "8px 0 16px",
    lineHeight: 1.5,
  },
  button: {
    background: "#2a2a2a",
    color: "#f0f0f0",
    border: "1px solid #3a3a3a",
    borderRadius: 8,
    padding: "10px 24px",
    fontSize: 14,
    cursor: "pointer",
    width: "100%",
  },
};
