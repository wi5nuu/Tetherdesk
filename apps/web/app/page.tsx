"use client";

import { useState } from "react";
import Link from "next/link";
import { useLang } from "../lib/lang-context";
import { DonateModal } from "./components/DonateModal";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const s = {
  page: { background: "#0a0a0a", color: "#e0e0e0", fontFamily: '"Calibri", "Segoe UI", Tahoma, Geneva, sans-serif', minHeight: "100dvh", overflowX: "hidden" as const } as React.CSSProperties,
  wrap: { width: "100%", maxWidth: "var(--page-max)", margin: "0 auto", padding: "0 var(--page-padding)" } as React.CSSProperties,
  mono: { fontFamily: '"SF Mono", "Fira Code", "Roboto Mono", monospace' } as React.CSSProperties,
  btn: { display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: "pointer", border: "none", transition: "all 0.15s", textDecoration: "none" } as React.CSSProperties,
  btnPrimary: { background: "#4ade80", color: "#0a0a0a" } as React.CSSProperties,
  btnOutline: { background: "transparent", color: "#e0e0e0", border: "1px solid #2a2a2a" } as React.CSSProperties,
  section: { padding: "80px 0" } as React.CSSProperties,
  sectionAlt: { padding: "80px 0", borderTop: "1px solid #141414" } as React.CSSProperties,
  h2: { fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, marginBottom: 12, letterSpacing: "-0.02em" } as React.CSSProperties,
  h3: { fontSize: 20, fontWeight: 600, marginBottom: 8 } as React.CSSProperties,
  p: { fontSize: 15, lineHeight: 1.6, color: "#888", maxWidth: 600 } as React.CSSProperties,
  center: { textAlign: "center" as const } as React.CSSProperties,
  flexCenter: { display: "flex", alignItems: "center", justifyContent: "center" } as React.CSSProperties,
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, marginTop: 48 } as React.CSSProperties,
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, marginTop: 48 } as React.CSSProperties,
};

/* ------------------------------------------------------------------ */
/*  SVG Icons                                                          */
/* ------------------------------------------------------------------ */

const ICONS = {
  server:  "M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M2 14h20M10 6h4M10 18h4M6 10v.01M10 10v.01M14 10v.01M18 10v.01",
  lock:    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  signal:  "M22 12h-4l-3 9L9 3l-3 9H2",
  monitor: "M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm4 16h12M8 20l4-4 4 4",
  zapped:  "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  github:  "M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.268 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.293 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z",
  phone:   "M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2Zm3 2v16M12 18h.01",
};

function SvgIcon({ path }: { path: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function IconBox({ icon }: { icon: keyof typeof ICONS }) {
  return (
    <div style={{ width: 44, height: 44, borderRadius: 10, background: "linear-gradient(135deg, #166534 0%, #0a2e14 100%)", border: "1px solid #22c55e33", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
      <SvgIcon path={ICONS[icon]} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

function Hero() {
  const { tr } = useLang();
  const h = tr.hero;

  return (
    <section className="landing-section" style={{ ...s.section, paddingTop: 100, paddingBottom: 60, textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "50%", left: "50%", translate: "-50% -50%", width: "80vw", height: "80vw", maxWidth: 700, maxHeight: 700, background: "radial-gradient(circle, rgba(74,222,128,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div className="landing-wrap" style={{ ...s.wrap, position: "relative" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#111", border: "1px solid #1f1f1f", borderRadius: 20, padding: "4px 14px 4px 4px", marginBottom: 32, fontSize: 12 }}>
          <span style={{ background: "#4ade80", color: "#0a0a0a", borderRadius: 20, padding: "2px 10px", fontWeight: 600 }}>{h.badge}</span>
          <span style={{ color: "#888" }}>{h.badgeSub}</span>
        </div>
        <h1 className="landing-hero-title" style={{ fontSize: "clamp(36px, 8vw, 64px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 20 }}>
          <div>{h.title1}</div>
          <div>{h.title2}</div>
          <div>{h.title3}</div>
        </h1>
        <p style={{ ...s.p, margin: "0 auto 40px", fontSize: "clamp(15px, 2.5vw, 18px)", maxWidth: 520 }}>
          {h.subtitle}
        </p>
        <div className="landing-buttons" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <Link href="/access" className="btn-primary" style={{ ...s.btn, ...s.btnPrimary, fontSize: "clamp(13px, 3.5vw, 16px)", padding: "12px clamp(16px, 4vw, 36px)", whiteSpace: "nowrap" }}>{h.startPairing}</Link>
          <Link href="/dashboard" className="btn-secondary" style={{ ...s.btn, ...s.btnOutline, fontSize: "clamp(13px, 3.5vw, 16px)", padding: "12px clamp(16px, 4vw, 36px)", whiteSpace: "nowrap" }}>{h.dashboard}</Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Terminal Demo                                                      */
/* ------------------------------------------------------------------ */

function TerminalDemo() {
  const lines = [
    { text: "$ npx tetherdesk", dim: true },
    { text: "", dim: false },
    { text: "  TetherDesk agent starting...", dim: false, color: "#4ade80" },
    { text: "  Signaling connected  ✓", dim: false, color: "#4ade80" },
    { text: "", dim: false },
    { text: "  Access key (expires in 90s):", dim: false },
    { text: "  TD-A3F7K2", dim: false, color: "#facc15" },
    { text: "", dim: false },
    { text: "  Steps:", dim: false },
    { text: "  1. Open dashboard:  https://tetherdesk-five.vercel.app/access", dim: false },
    { text: "  2. Enter key above in the \"Access Key\" field", dim: false },
    { text: "  3. Click Allow on this laptop when prompted", dim: false },
    { text: "", dim: false },
    { text: "  (Key expires in 90 seconds — a new one will appear automatically)", dim: true },
  ];

  return (
    <section style={{ ...s.section, paddingTop: 0 }}>
      <div className="landing-wrap" style={{ ...s.wrap, maxWidth: 640 }}>
        <div className="landing-terminal">
          <div className="landing-terminal-bar">
            <div className="landing-terminal-dot" style={{ background: "#f87171" }} />
            <div className="landing-terminal-dot" style={{ background: "#fbbf24" }} />
            <div className="landing-terminal-dot" style={{ background: "#4ade80" }} />
            <span style={{ color: "#555", fontSize: 12, marginLeft: 8 }}>terminal — tetherdesk</span>
          </div>
          <div style={{ padding: "16px 20px", ...s.mono, fontSize: 13, lineHeight: 1.7 }}>
            {lines.map((l, i) => (
              <div key={i} style={{ color: l.color ?? (l.dim !== false ? "#888" : "#ccc"), whiteSpace: "pre-wrap" }}>{l.text}</div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              {["E2E Encrypted", "P2P WebRTC", "Open Source"].map((label) => (
                <span key={label} style={{ fontSize: 12, color: "#4ade80", border: "1px solid #1f1f1f", borderRadius: 20, padding: "2px 10px" }}>✓ {label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Why Choose                                                         */
/* ------------------------------------------------------------------ */

function WhyChoose() {
  const { tr } = useLang();
  const w = tr.why;
  const icons: (keyof typeof ICONS)[] = ["server", "lock", "signal", "phone", "zapped", "github"];

  return (
    <section id="why" className="landing-section" style={s.sectionAlt}>
      <div style={s.wrap}>
        <h2 style={{ ...s.h2, ...s.center }}>{w.title}</h2>
        <p style={{ ...s.p, margin: "0 auto 48px", ...s.center }}>{w.subtitle}</p>
        <div className="landing-grid" style={s.grid3}>
          {w.items.map((item, i) => (
            <div key={item.title} className="card-hover" style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 12, padding: 28, display: "flex", flexDirection: "column" }}>
              <IconBox icon={icons[i]!} />
              <h3 style={s.h3}>{item.title}</h3>
              <p style={{ ...s.p, fontSize: 14 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Features                                                           */
/* ------------------------------------------------------------------ */

function Features() {
  const { tr } = useLang();
  const f = tr.features;
  const icons: (keyof typeof ICONS)[] = ["monitor", "zapped", "lock", "phone", "server", "signal"];

  return (
    <section id="features" className="landing-section" style={s.sectionAlt}>
      <div style={s.wrap}>
        <h2 style={{ ...s.h2, ...s.center }}>{f.title}</h2>
        <p style={{ ...s.p, margin: "0 auto 48px", ...s.center }}>{f.subtitle}</p>
        <div className="landing-grid" style={s.grid3}>
          {f.items.map((item, i) => (
            <div key={item.title} className="card-hover" style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 12, padding: 28, display: "flex", flexDirection: "column" }}>
              <IconBox icon={icons[i]!} />
              <h3 style={s.h3}>{item.title}</h3>
              <p style={{ ...s.p, fontSize: 14 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  How It Works                                                       */
/* ------------------------------------------------------------------ */

function HowItWorks() {
  const { tr } = useLang();
  const h = tr.how;

  return (
    <section id="how-it-works" className="landing-section" style={s.sectionAlt}>
      <div style={s.wrap}>
        <h2 style={{ ...s.h2, ...s.center }}>{h.title}</h2>
        <p style={{ ...s.p, margin: "0 auto 48px", ...s.center }}>{h.subtitle}</p>
        <div className="landing-grid" style={s.grid3}>
          {h.steps.map((step) => (
            <div key={step.num} className="card-hover" style={{ textAlign: "center", padding: 32, borderRadius: 12 }}>
              <div style={{ fontSize: 48, fontWeight: 800, color: "#4ade80", opacity: 0.2, marginBottom: 16 }}>{step.num}</div>
              <h3 style={s.h3}>{step.title}</h3>
              <p style={{ ...s.p, fontSize: 14, margin: "10px auto 0" }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  CLI Demo / CTA                                                     */
/* ------------------------------------------------------------------ */

function CliDemo() {
  const { tr } = useLang();
  const c = tr.cta;

  const output = [
    "$ npx tetherdesk",
    "",
    "  TetherDesk agent starting...",
    "  Signaling connected  ✓",
    "",
    "  Access key (expires in 90s):",
    "  TD-A3F7K2",
    "",
    "  Steps:",
    "  1. Open:  https://tetherdesk-five.vercel.app/access",
    "  2. Enter key above in the \"Access Key\" field",
    "  3. Click Allow on this laptop when prompted",
    "",
    "  (Key expires in 90 seconds — a new one will appear automatically)",
  ];

  return (
    <section style={{ ...s.section, padding: "60px 0", background: "#080808" }}>
      <div style={s.wrap}>
        <h2 style={{ ...s.h2, ...s.center }}>{c.title}</h2>
        <p style={{ ...s.p, margin: "0 auto 48px", ...s.center }}>{c.subtitle}</p>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div className="landing-terminal">
            <div className="landing-terminal-bar">
              <div className="landing-terminal-dot" style={{ background: "#f87171" }} />
              <div className="landing-terminal-dot" style={{ background: "#fbbf24" }} />
              <div className="landing-terminal-dot" style={{ background: "#4ade80" }} />
              <span style={{ color: "#555", fontSize: 12, marginLeft: 8 }}>terminal</span>
            </div>
            <div style={{ padding: "16px 20px", ...s.mono, fontSize: 13, lineHeight: 1.7 }}>
              {output.map((l, i) => {
                const isGreen = l.includes("✓") || l.includes("starting");
                const isYellow = l === "  TD-A3F7K2";
                const isDim = l.startsWith("$") || l.startsWith("  (");
                const color = isYellow ? "#facc15" : isGreen ? "#4ade80" : isDim ? "#888" : "#ccc";
                return (
                  <div key={i} style={{ color, whiteSpace: "pre-wrap" }}>{l}</div>
                );
              })}
            </div>
          </div>
          <div style={{ ...s.flexCenter, gap: 10, marginTop: 32 }}>
            <Link href="/access" className="btn-primary" style={{ ...s.btn, ...s.btnPrimary, whiteSpace: "nowrap", fontSize: "clamp(13px, 3.5vw, 15px)", padding: "12px clamp(16px, 4vw, 28px)" }}>{c.getRemote}</Link>
            <a href="https://github.com/wi5nuu/Tetherdesk" className="btn-secondary" style={{ ...s.btn, ...s.btnOutline, whiteSpace: "nowrap", fontSize: "clamp(13px, 3.5vw, 15px)", padding: "12px clamp(16px, 4vw, 28px)" }} target="_blank" rel="noopener noreferrer">{c.github}</a>
          </div>
          <p style={{ ...s.center, fontSize: 12, color: "#555", marginTop: 16 }}>No credit card required · Open source · MIT License</p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const [showDonate, setShowDonate] = useState(false);

  return (
    <div style={s.page}>
      <Navbar onDonate={() => setShowDonate(true)} />
      <Hero />
      <TerminalDemo />
      <WhyChoose />
      <Features />
      <HowItWorks />
      <CliDemo />
      <Footer />
      {showDonate && <DonateModal onClose={() => setShowDonate(false)} />}
    </div>
  );
}
