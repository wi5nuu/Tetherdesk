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
  inputFocus: { borderColor: "#4ade80" },
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
    <div style={s.page}>
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
            autoComplete="off"
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
            disabled={!isValidKey || phase.phase === "validating"}
            style={{ ...s.btn, ...(!isValidKey || phase.phase === "validating" ? s.btnDisabled : {}) }}
          >
            {phase.phase === "validating" ? "Validating..." : "Connect"}
          </button>
        </form>

        <div style={s.setup}>
          <div style={{ fontWeight: 600, color: "#888", marginBottom: 12 }}>How to get a key</div>

          <div style={{ fontWeight: 500, fontSize: 12, color: "#888" }}>Option A: Persistent API Key</div>
          <div style={s.setupStep}>
            Open{" "}
            <Link href="/dashboard" style={{ color: "#4ade80", textDecoration: "none" }}>
              dashboard
            </Link>{" "}
            on your laptop, click <strong style={{ color: "#888" }}>Generate Key</strong>, then enter the <strong style={{ color: "#888" }}>sk-xxx</strong> key here.
          </div>

          <div style={{ fontWeight: 500, fontSize: 12, color: "#888", marginTop: 16 }}>Option B: One-Time Key</div>
          <div style={s.setupStep}>
            Run this on your computer:
          </div>
          <div style={s.setupCode}>npx tetherdesk start</div>
          <div style={s.setupStep}>
            A <strong style={{ color: "#888" }}>TD-XXXXXX</strong> key appears in the terminal. Enter it here.
          </div>
        </div>

      </div>

      <div style={s.footer}>
        <Link href="/" style={s.link}>Home</Link>
        <span style={{ color: "#333" }}>·</span>
        <Link href="/dashboard" style={s.link}>Dashboard</Link>
        <span style={{ color: "#333" }}>·</span>
        <a href="https://github.com/wi5nuu/Tetherdesk#readme" style={s.link} target="_blank" rel="noopener noreferrer">Docs</a>
      </div>
    </div>
  );
}
