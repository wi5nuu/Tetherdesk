"use client";

import { useState, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type KeyPhase =
  | { phase: "input" }
  | { phase: "validating" }
  | { phase: "error"; message: string }
  | { phase: "success" };

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh", background: "#0a0a0a", color: "#e0e0e0",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "min(400px, 100%)", background: "#111",
    border: "1px solid #1f1f1f", borderRadius: 12,
    padding: "40px 32px",
  },
  logo: { fontSize: 24, fontWeight: 700, color: "#4ade80", marginBottom: 4, textAlign: "center" as const },
  version: { fontSize: 11, color: "#555", textAlign: "center" as const, marginBottom: 24,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6 },
  label: { fontSize: 13, color: "#888", marginBottom: 8, fontWeight: 500 },
  input: {
    width: "100%", padding: "12px 14px", background: "#0a0a0a",
    border: "1px solid #2a2a2a", borderRadius: 8, color: "#e0e0e0",
    fontSize: 15, outline: "none", fontFamily: '"SF Mono", "Fira Code", monospace',
    boxSizing: "border-box" as const,
  },
  inputError: { borderColor: "#f87171" },
  btn: {
    width: "100%", padding: "12px", background: "#4ade80", color: "#0a0a0a",
    border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600,
    cursor: "pointer", marginTop: 16, transition: "opacity 0.15s",
  },
  btnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  btnSecondary: {
    width: "100%", padding: "12px", background: "transparent", color: "#e0e0e0",
    border: "1px solid #2a2a2a", borderRadius: 8, fontSize: 15, fontWeight: 500,
    cursor: "pointer", marginTop: 8, transition: "opacity 0.15s",
  },
  checkbox: { display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer", fontSize: 13, color: "#888" },
  footer: { display: "flex", justifyContent: "center", gap: 24, marginTop: 32, fontSize: 13 },
  link: { color: "#555", textDecoration: "none", cursor: "pointer" },
  error: { fontSize: 13, color: "#f87171", marginTop: 8 },
  hint: { fontSize: 12, color: "#555", marginTop: 12, lineHeight: 1.5, textAlign: "center" as const },
  sub: { fontSize: 14, color: "#666", textAlign: "center" as const, marginBottom: 28 },
  setup: {
    marginTop: 24, paddingTop: 20, borderTop: "1px solid #1f1f1f",
    fontSize: 13, color: "#666", lineHeight: 1.6, textAlign: "center" as const,
  },
  setupCode: {
    display: "inline-block", fontFamily: '"SF Mono", "Fira Code", monospace',
    fontSize: 12, color: "#4ade80", background: "#0a0a0a",
    padding: "6px 12px", borderRadius: 6, marginTop: 8,
  },
  setupStep: { fontSize: 13, color: "#555", marginTop: 8, lineHeight: 1.5, textAlign: "center" as const },
};

export default function AccessPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [phase, setPhase] = useState<KeyPhase>({ phase: "input" });

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    setPhase({ phase: "validating" });

    try {
      const resp = await fetch("/api/access/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: trimmed, remember }),
      });
      const data = await resp.json() as { ok: boolean; redirect?: string; error?: { message: string } };
      if (data.ok && data.redirect) {
        if (remember) {
          localStorage.setItem("td:access_key", trimmed);
        }
        router.replace(data.redirect);
      } else {
        setPhase({ phase: "error", message: data.error?.message ?? "Invalid access key" });
      }
    } catch {
      setPhase({ phase: "error", message: "Could not connect to server. Please try again." });
    }
  }, [key, remember, router]);

  const isValidKey = key.trim().length > 0;

  return (
    <div className="access-container" style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>TetherDesk</div>
        <div style={s.version}>
          <span style={{ color: "#4ade80" }}>●</span> v2.1.21
        </div>
        <p style={s.sub}>Access your terminal from anywhere</p>

        <form onSubmit={handleSubmit}>
          <label style={s.label}>Access Key</label>
          <input
            type="text"
            value={key}
            onChange={(e) => { setKey(e.target.value); if (phase.phase === "error") setPhase({ phase: "input" }); }}
            placeholder="sk-xxx... or One-Time Key (ABC123)"
            disabled={phase.phase === "validating"}
            autoFocus
            autoComplete="one-time-code"
            spellCheck={false}
            style={{
              ...s.input,
              ...(phase.phase === "error" ? s.inputError : {}),
            }}
          />
          {phase.phase === "error" && (
            <p style={s.error}>{phase.message}</p>
          )}

          <label style={s.checkbox}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ accentColor: "#4ade80" }}
            />
            Remember this key
          </label>

          <button
            type="submit"
            className="btn-primary"
            disabled={!isValidKey || phase.phase === "validating"}
            style={{ ...s.btn, ...(!isValidKey || phase.phase === "validating" ? s.btnDisabled : {}) }}
          >
            {phase.phase === "validating" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center" }}><span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #0a0a0a", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />Validating...</span> : "Connect"}
          </button>
        </form>

        <div style={s.setup}>
          <div style={{ fontWeight: 600, color: "#e0e0e0", marginBottom: 16 }}>Before you connect</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Step 1 */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ background: "#4ade80", color: "#0a0a0a", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>1</span>
              <div>
                <div style={{ fontSize: 13, color: "#e0e0e0", fontWeight: 500, marginBottom: 4 }}>Run the agent on your laptop</div>
                <div style={s.setupCode}>npx tetherdesk start</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>This starts the agent and generates a pairing QR code in the dashboard.</div>
              </div>
            </div>

            {/* Step 2 — Option A */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ background: "#1a1a1a", color: "#4ade80", border: "1px solid #2a2a2a", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>2</span>
              <div>
                <div style={{ fontSize: 13, color: "#e0e0e0", fontWeight: 500, marginBottom: 2 }}>Get your access key — choose one:</div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                  <strong style={{ color: "#888" }}>Option A (one-time):</strong> A <code style={{ color: "#4ade80", fontSize: 11, background: "#111", padding: "1px 5px", borderRadius: 3 }}>TD-XXXXXX</code> key appears in the terminal after starting. Enter it above.
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  <strong style={{ color: "#888" }}>Option B (persistent):</strong> Open the{" "}
                  <Link href="/dashboard" className="link-hover" style={{ color: "#4ade80", textDecoration: "none" }}>dashboard</Link>
                  {" "}→ click <strong style={{ color: "#888" }}>Generate Key</strong> → copy the <code style={{ color: "#4ade80", fontSize: 11, background: "#111", padding: "1px 5px", borderRadius: 3 }}>sk-xxx</code> key.
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ background: "#1a1a1a", color: "#4ade80", border: "1px solid #2a2a2a", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>3</span>
              <div>
                <div style={{ fontSize: 13, color: "#e0e0e0", fontWeight: 500, marginBottom: 2 }}>Enter the key above and tap Connect</div>
                <div style={{ fontSize: 12, color: "#555" }}>Your phone camera will open. Point it at the QR code shown on your laptop dashboard to complete the connection.</div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div style={s.footer}>
        <Link href="/" className="link-landing" style={s.link}>Home</Link>
        <span style={{ color: "#333" }}>·</span>
        <Link href="/dashboard" className="link-landing" style={s.link}>Dashboard</Link>
        <span style={{ color: "#333" }}>·</span>
        <a href="https://github.com/wi5nuu/Tetherdesk#readme" className="link-landing" style={s.link} target="_blank" rel="noopener noreferrer">Docs</a>
      </div>
    </div>
  );
}
