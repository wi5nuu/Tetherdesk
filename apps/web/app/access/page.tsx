"use client";

import { useState, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLang } from "../../lib/lang-context";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";
import { APP_VERSION } from "../../lib/constants";

type KeyPhase =
  | { phase: "input" }
  | { phase: "validating" }
  | { phase: "error"; message: string }
  | { phase: "success" };

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh", background: "#0a0a0a", color: "#e0e0e0",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: "flex", flexDirection: "column", width: "100%",
  },
  main: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px var(--page-padding)",
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
  checkbox: { display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer", fontSize: 13, color: "#888" },
  footer: { display: "flex", justifyContent: "center", gap: 24, marginTop: 32, fontSize: 13 },
  link: { color: "#555", textDecoration: "none", cursor: "pointer" },
  error: { fontSize: 13, color: "#f87171", marginTop: 8 },
  sub: { fontSize: 14, color: "#666", textAlign: "center" as const, marginBottom: 28 },
  setup: {
    marginTop: 24, paddingTop: 20, borderTop: "1px solid #1f1f1f",
    fontSize: 13, color: "#666", lineHeight: 1.6,
  },
  setupCode: {
    display: "inline-block", fontFamily: '"SF Mono", "Fira Code", monospace',
    fontSize: 12, color: "#4ade80", background: "#0a0a0a",
    padding: "6px 12px", borderRadius: 6, marginTop: 8,
  },
};

export default function AccessPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [phase, setPhase] = useState<KeyPhase>({ phase: "input" });
  const { tr } = useLang();
  const a = tr.access;

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
        if (remember) localStorage.setItem("td:access_key", trimmed);
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
      <Navbar />
      <main style={s.main}>
        <div style={s.card}>
          <div style={s.logo}>{a.title}</div>
          <div style={s.version}>
            <span style={{ color: "#4ade80" }}>●</span> v{APP_VERSION}
          </div>
          <p style={s.sub}>{a.subtitle}</p>

          <form onSubmit={handleSubmit}>
            <label style={s.label}>{a.label}</label>
            <input
              type="text"
              value={key}
              onChange={(e) => { setKey(e.target.value); if (phase.phase === "error") setPhase({ phase: "input" }); }}
              placeholder={a.placeholder}
              disabled={phase.phase === "validating"}
              autoFocus
              autoComplete="one-time-code"
              spellCheck={false}
              style={{ ...s.input, ...(phase.phase === "error" ? s.inputError : {}), outline: "none" }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.boxShadow = "0 0 0 2px #4ade8055"; (e.target as HTMLInputElement).style.borderColor = "#4ade80"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.boxShadow = ""; (e.target as HTMLInputElement).style.borderColor = phase.phase === "error" ? "#f87171" : "#2a2a2a"; }}
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
              {a.remember}
            </label>

            <button
              type="submit"
              className="btn-primary"
              disabled={!isValidKey || phase.phase === "validating"}
              style={{ ...s.btn, ...(!isValidKey || phase.phase === "validating" ? s.btnDisabled : {}) }}
            >
              {phase.phase === "validating"
                ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                    <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #0a0a0a", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
                    {a.validating}
                  </span>
                )
                : a.connect}
            </button>
          </form>

          <div style={s.setup}>
            <div style={{ fontWeight: 600, color: "#e0e0e0", marginBottom: 16 }}>{a.beforeTitle}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Step 1 */}
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ background: "#4ade80", color: "#0a0a0a", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>1</span>
                <div>
                  <div style={{ fontSize: 13, color: "#e0e0e0", fontWeight: 500, marginBottom: 4 }}>{a.step1Title}</div>
                  <div style={s.setupCode}>{a.step1Code}</div>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{a.step1Hint}</div>
                </div>
              </div>

              {/* Step 2 */}
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ background: "#1a1a1a", color: "#4ade80", border: "1px solid #2a2a2a", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>2</span>
                <div>
                  <div style={{ fontSize: 13, color: "#e0e0e0", fontWeight: 500, marginBottom: 2 }}>{a.step2Title}</div>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                    <strong style={{ color: "#888" }}>{a.step2OptionA}</strong>{" "}
                    <code style={{ color: "#4ade80", fontSize: 11, background: "#111", padding: "1px 5px", borderRadius: 3 }}>TD-XXXXXX</code>{" "}
                    {a.step2OptionAHint}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    <strong style={{ color: "#888" }}>{a.step2OptionB}</strong>{" "}
                    {a.step2OptionBHint1 && (
                      <>
                        <Link href="/dashboard" className="link-hover" style={{ color: "#4ade80", textDecoration: "none" }}>{a.step2OptionBHint1}</Link>{" "}
                      </>
                    )}
                    {a.step2OptionBHint2}{" "}
                    <strong style={{ color: "#888" }}>{a.step2OptionBHint3}</strong>{" "}
                    {a.step2OptionBHint4}{" "}
                    <code style={{ color: "#4ade80", fontSize: 11, background: "#111", padding: "1px 5px", borderRadius: 3 }}>sk-xxx</code>
                    {a.step2OptionBHint5}
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ background: "#1a1a1a", color: "#4ade80", border: "1px solid #2a2a2a", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>3</span>
                <div>
                  <div style={{ fontSize: 13, color: "#e0e0e0", fontWeight: 500, marginBottom: 2 }}>{a.step3Title}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{a.step3Hint}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
