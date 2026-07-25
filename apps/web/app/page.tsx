"use client";

import { useState } from "react";
import Link from "next/link";
import { useLang } from "../lib/lang-context";
import { DonateModal } from "./components/DonateModal";

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const s = {
  page: { background: "#0a0a0a", color: "#e0e0e0", fontFamily: '"Calibri", "Segoe UI", Tahoma, Geneva, sans-serif', minHeight: "100dvh", overflowX: "hidden" as const } as React.CSSProperties,
  wrap: { maxWidth: 1100, margin: "0 auto", padding: "0 20px" } as React.CSSProperties,
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

const APP_VERSION = "2.1.21";

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
/*  Language Switcher                                                  */
/* ------------------------------------------------------------------ */

function LangSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <div style={{ display: "flex", alignItems: "center", background: "#111", border: "1px solid #1f1f1f", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
      {(["en", "id"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          style={{
            padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: "none", transition: "all 0.15s",
            background: lang === l ? "#4ade80" : "transparent",
            color: lang === l ? "#0a0a0a" : "#555",
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Navbar                                                             */
/* ------------------------------------------------------------------ */

function Navbar({ onDonate }: { onDonate: () => void }) {
  const [menu, setMenu] = useState(false);
  const { tr } = useLang();
  const n = tr.nav;

  const links = [
    { label: n.features, href: "#features" },
    { label: n.howItWorks, href: "#how-it-works" },
    { label: n.docs, href: "/docs" },
  ];

  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(10,10,10,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid #141414" }}>
      <div className="landing-wrap" style={{ ...s.wrap, display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: "#4ade80" }}>TetherDesk</span>
          <span style={{ fontSize: 11, color: "#555", padding: "2px 6px", border: "1px solid #222", borderRadius: 4 }}>v{APP_VERSION}</span>
        </div>

        {/* Desktop right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "none", gap: 20, alignItems: "center" }} className="landing-nav-desktop">
            {links.map((l) => (
              <Link key={l.label} href={l.href} className="navbar-link" style={{ color: "#888", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
                {l.label}
              </Link>
            ))}
          </div>

          {/* Donate button — desktop */}
          <button
            onClick={onDonate}
            className="btn-secondary landing-nav-desktop"
            style={{ display: "none", alignItems: "center", gap: 6, padding: "6px 14px", background: "transparent", border: "1px solid #2a2a2a", borderRadius: 6, color: "#888", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}
          >
            ♥ {n.donate}
          </button>

          <LangSwitcher />

          <Link href="/access" className="btn-primary" style={{ ...s.btn, ...s.btnPrimary, fontSize: 13, padding: "8px 18px" }}>
            {n.getStarted}
          </Link>

          {/* Hamburger */}
          <button
            onClick={() => setMenu(!menu)}
            style={{ background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer", display: "none" }}
            className="landing-menu-btn"
            aria-expanded={menu}
            aria-label="Toggle navigation menu"
          >
            {menu ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menu && (
        <div style={{ borderTop: "1px solid #141414", padding: "12px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {links.map((l) => (
            <a key={l.label} href={l.href} className="mobile-menu-link" style={{ color: "#888", textDecoration: "none", fontSize: 15 }} onClick={() => setMenu(false)}>
              {l.label}
            </a>
          ))}
          <button
            onClick={() => { setMenu(false); onDonate(); }}
            style={{ background: "none", border: "none", color: "#888", textAlign: "left", padding: 0, fontSize: 15, cursor: "pointer" }}
          >
            ♥ {n.donate}
          </button>
        </div>
      )}
    </nav>
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
    { text: "$ npx tetherdesk start", dim: true },
    { text: "", dim: false },
    { text: " TetherDesk is running!", dim: false, color: "#4ade80" },
    { text: "", dim: false },
    { text: "  1. Open the dashboard:  http://localhost:3000", dim: false },
    { text: "  2. Scan the QR code on your phone", dim: false },
    { text: "  3. Tap Allow on this laptop to approve the connection", dim: false },
    { text: "", dim: false },
    { text: "  Press Ctrl+C to stop all processes.", dim: true },
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
    "$ npx tetherdesk start",
    "",
    " TetherDesk is running!",
    "",
    "  1. Open the dashboard:  http://localhost:3000",
    "  2. Scan the QR code on your phone",
    "  3. Tap Allow on this laptop to approve the connection",
    "",
    "  Press Ctrl+C to stop all processes.",
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
                const isGreen = l === " TetherDesk is running!";
                const isDim = l.startsWith("$") || l.startsWith("  ");
                return (
                  <div key={i} style={{ color: isGreen ? "#4ade80" : isDim ? "#888" : "#ccc", whiteSpace: "pre-wrap" }}>{l}</div>
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
/*  Footer                                                             */
/* ------------------------------------------------------------------ */

function Footer({ onDonate }: { onDonate: () => void }) {
  const { tr } = useLang();
  const n = tr.nav;
  const d = tr.donate;
  const fl = (color = "#666") => ({ color, textDecoration: "none", cursor: "pointer", fontSize: 13, lineHeight: 2 } as React.CSSProperties);

  return (
    <footer style={{ borderTop: "1px solid #141414", padding: "48px 0 32px" }}>
      <div style={s.wrap}>
        <div className="landing-grid" style={s.grid2}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#4ade80" }}>TetherDesk</span>
            <p style={{ ...s.p, fontSize: 13, marginTop: 8 }}>Secure remote terminal and desktop access. Connect to your machines from anywhere in the world.</p>
            {/* Donate button in footer */}
            <button
              onClick={onDonate}
              className="btn-secondary"
              style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "transparent", border: "1px solid #2a2a2a", borderRadius: 6, color: "#888", fontSize: 13, cursor: "pointer", transition: "all 0.15s" }}
            >
              ♥ {d.btnLabel}
            </button>
            <p style={{ fontSize: 12, color: "#555", marginTop: 12 }}>© 2026 TetherDesk. All rights reserved.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            <div>
              <p style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Product</p>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <Link href="/access" className="link-hover" style={fl()}>Remote</Link>
                <Link href="/dashboard" className="link-hover" style={fl()}>Dashboard</Link>
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Resources</p>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <a href="https://github.com/wi5nuu/Tetherdesk" className="link-hover" style={fl()} target="_blank" rel="noopener noreferrer">GitHub</a>
                <Link href="/docs" className="link-hover" style={fl()}>{n.docs}</Link>
                <a href="https://github.com/wi5nuu/Tetherdesk/discussions" className="link-hover" style={fl()} target="_blank" rel="noopener noreferrer">Community</a>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 32, paddingTop: 24, borderTop: "1px solid #141414", flexWrap: "wrap", fontSize: 12, color: "#444" }}>
          <span>{tr.footer.built}</span>
          <div style={{ display: "flex", gap: 16, marginLeft: "auto" }}>
            <a href="https://github.com/wi5nuu/Tetherdesk" className="link-hover" style={fl("#555")} target="_blank" rel="noopener noreferrer">GitHub</a>
            <Link href="/docs" className="link-hover" style={fl("#555")}>{n.docs}</Link>
          </div>
        </div>
      </div>
    </footer>
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
      <Footer onDonate={() => setShowDonate(true)} />
      {showDonate && <DonateModal onClose={() => setShowDonate(false)} />}
    </div>
  );
}
