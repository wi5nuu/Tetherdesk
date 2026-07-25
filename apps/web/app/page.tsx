"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const t = {
  page: { background: "#0a0a0a", color: "#e0e0e0", fontFamily: '"Calibri", "Segoe UI", Tahoma, Geneva, sans-serif', minHeight: "100dvh", overflowX: "hidden" as const } as React.CSSProperties,
  wrap: { maxWidth: 1100, margin: "0 auto", padding: "0 20px" } as React.CSSProperties,
  ac: { color: "#4ade80" } as React.CSSProperties,
  dim: { color: "#666" } as React.CSSProperties,
  muted: { color: "#888" } as React.CSSProperties,
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
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function NavLink({ label, href }: { label: string; href: string }) {
  const [h, setH] = useState(false);
  return (
    <a href={href}
      style={{ color: h ? "#4ade80" : "#888", textDecoration: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, transition: "color 0.15s" }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}>
      {label}
    </a>
  );
}

function Navbar() {
  const [menu, setMenu] = useState(false);
  const links = [
    { label: "Features", href: "#features" },
    { label: "How it Works", href: "#how-it-works" },
    { label: "Docs", href: "/docs" },
  ];

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "rgba(10,10,10,0.85)", backdropFilter: "blur(12px)",
      borderBottom: "1px solid #141414",
    }}>
      <div className="landing-wrap" style={{ ...t.wrap, display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: "#4ade80" }}>TetherDesk</span>
          <span style={{ fontSize: 11, color: "#555", padding: "2px 6px", border: "1px solid #222", borderRadius: 4 }}>v{APP_VERSION}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "none", gap: 24, alignItems: "center" }} className="landing-nav-desktop">
            {links.map((l) => <NavLink key={l.label} label={l.label} href={l.href} />)}
          </div>
          <Link href="/access" style={{ ...t.btn, ...t.btnPrimary, fontSize: 13, padding: "8px 18px" }}>Get Started</Link>
          <button onClick={() => setMenu(!menu)} style={{ background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer", display: "none" }} className="landing-menu-btn">
            {menu ? "✕" : "☰"}
          </button>
        </div>
      </div>
      {menu && (
        <div style={{ borderTop: "1px solid #141414", padding: "12px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {links.map((l) => (
            <a key={l.label} href={l.href} style={{ color: "#888", textDecoration: "none", cursor: "pointer", fontSize: 15 }}
              onClick={() => setMenu(false)}>{l.label}</a>
          ))}
        </div>
      )}
    </nav>
  );
}

function Hero() {
  return (
    <section className="landing-section" style={{
      ...t.section, paddingTop: 100, paddingBottom: 60,
      textAlign: "center" as const, position: "relative" as const, overflow: "hidden" as const,
    }}>
      <div style={{
        position: "absolute", top: "50%", left: "50%", translate: "-50% -50%",
        width: "80vw", height: "80vw", maxWidth: 700, maxHeight: 700,
        background: "radial-gradient(circle, rgba(74,222,128,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div className="landing-wrap" style={{ ...t.wrap, position: "relative" as const }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#111", border: "1px solid #1f1f1f", borderRadius: 20, padding: "4px 14px 4px 4px", marginBottom: 32, fontSize: 12 }}>
          <span style={{ background: "#4ade80", color: "#0a0a0a", borderRadius: 20, padding: "2px 10px", fontWeight: 600 }}>OPEN SOURCE</span>
          <span style={{ color: "#888" }}>Free & Self-Hosted</span>
        </div>
        <h1 className="landing-hero-title" style={{ fontSize: "clamp(36px, 8vw, 64px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 20 }}>
          <div>Control your laptop</div>
          <div>from your phone.</div>
          <div>Anywhere.</div>
        </h1>
        <p style={{ ...t.p, margin: "0 auto 40px", fontSize: "clamp(15px, 2.5vw, 18px)", maxWidth: 520 }}>
          Zero-config remote desktop. Scan QR, tap to control. End-to-end encrypted P2P connection via WebRTC.
        </p>
        <div className="landing-buttons" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <Link href="/access" style={{ ...t.btn, ...t.btnPrimary, fontSize: 16, padding: "14px 36px" }}>Start Pairing</Link>
          <Link href="/dashboard" style={{ ...t.btn, ...t.btnOutline, fontSize: 16, padding: "14px 36px" }}>Dashboard</Link>
        </div>
      </div>
    </section>
  );
}

function TerminalDemo() {
  const lines = [
    { text: "$ npm install -g tetherdesk", dim: true },
    { text: "", dim: false },
    { text: "$ tetherdesk start", dim: true },
    { text: "→ Starting server...", dim: false },
    { text: "→ Creating tunnel...", dim: false },
    { text: "✓ Server running on http://localhost:3000", dim: false },
    { text: "✓ Tunnel ready: https://xxx.trycloudflare.com", dim: false },
    { text: "", dim: false },
    { text: "  Ready in 30 seconds", dim: false, prompt: false },
  ];

  return (
    <section style={{ ...t.section, paddingTop: 0 }}>
      <div className="landing-wrap" style={{ ...t.wrap, maxWidth: 640 }}>
        <div className="landing-terminal">
          <div className="landing-terminal-bar">
            <div className="landing-terminal-dot" style={{ background: "#f87171" }} />
            <div className="landing-terminal-dot" style={{ background: "#fbbf24" }} />
            <div className="landing-terminal-dot" style={{ background: "#4ade80" }} />
            <span style={{ color: "#555", fontSize: 12, marginLeft: 8 }}>terminal — tetherdesk</span>
          </div>
          <div style={{ padding: "16px 20px", ...t.mono, fontSize: 13, lineHeight: 1.7 }}>
            {lines.map((l, i) => (
              <div key={i} style={{ color: l.dim !== false ? "#888" : "#ccc", whiteSpace: "pre-wrap" }}>
                {l.text}
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              {[
                { label: "100% Secure", color: "#4ade80" },
                { label: "<50ms Latency", color: "#4ade80" },
                { label: "24/7 Available", color: "#4ade80" },
              ].map((s) => (
                <span key={s.label} style={{ fontSize: 12, color: s.color, border: "1px solid #1f1f1f", borderRadius: 20, padding: "2px 10px" }}>
                  ✓ {s.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WhyChoose() {
  const benefits = [
    { 
      title: "Zero Infrastructure Cost", 
      desc: "Runs entirely on free tiers: Vercel Hobby + Upstash free Redis. No monthly subscription, no hidden charges.",
      icon: "💰"
    },
    { 
      title: "End-to-End Encrypted", 
      desc: "X25519 ECDH key exchange + AES-256-GCM encryption. Session keys never leave your devices. Server only relays encrypted messages.",
      icon: "🔒"
    },
    { 
      title: "Direct P2P Connection", 
      desc: "WebRTC connects your laptop and phone directly. Vercel backend only helps with initial pairing, then gets out of the way.",
      icon: "🌐"
    },
    { 
      title: "No App Store Required", 
      desc: "Phone client is a Progressive Web App (PWA). Works on any modern browser - iOS Safari, Android Chrome, desktop browsers.",
      icon: "📱"
    },
    { 
      title: "90-Second Pairing", 
      desc: "QR code expires in 90 seconds for security. One-time pairing keys (TD-XXXXXX) or persistent API keys (sk-xxx...) for repeat access.",
      icon: "⚡"
    },
    { 
      title: "Open Source & Auditable", 
      desc: "Full source code available on GitHub. Deploy your own backend, audit the crypto, modify as needed. No vendor lock-in.",
      icon: "🔓"
    },
  ];

  return (
    <section id="why" className="landing-section" style={t.sectionAlt}>
      <div style={t.wrap}>
        <h2 style={{ ...t.h2, ...t.center }}>Why TetherDesk?</h2>
        <p style={{ ...t.p, margin: "0 auto 48px", ...t.center }}>
          Built for developers who want secure remote access without the complexity
        </p>
        <div className="landing-grid" style={t.grid3}>
          {benefits.map((item) => (
            <div key={item.title} style={{ 
              background: "#0f0f0f", 
              border: "1px solid #1a1a1a", 
              borderRadius: 12, 
              padding: 28,
              transition: "all 0.2s"
            }}>
              <div style={{ fontSize: 32, marginBottom: 14 }}>{item.icon}</div>
              <h3 style={t.h3}>{item.title}</h3>
              <p style={{ ...t.p, fontSize: 14 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function IconBox({ children }: { children: ReactNode }) {
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 10,
      background: "linear-gradient(135deg, #166534 0%, #0a2e14 100%)",
      border: "1px solid #22c55e33",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 18, fontWeight: 700, color: "#4ade80", marginBottom: 14,
      fontFamily: '"SF Mono", "Fira Code", monospace',
    }}>
      {children}
    </div>
  );
}

function Features() {
  const items = [
    { title: "Screen Control", desc: "View and control your laptop screen from your phone. Mouse, keyboard, and touch gestures via WebRTC.", icon: ">_" },
    { title: "Zero Config", desc: "No port forwarding, no DNS setup. Just npx tetherdesk start and scan the QR code.", icon: "~/" },
    { title: "E2E Encrypted", desc: "X25519 ECDH + AES-256-GCM. Session keys derived locally, never transmitted. Server only relays encrypted messages.", icon: "SSL" },
    { title: "QR Pairing", desc: "Scan QR code from terminal with any camera app. 90-second expiry for security. No app store needed.", icon: "QR" },
    { title: "Persistent Keys", desc: "Generate API keys (sk-xxx...) from dashboard for repeat access without QR scanning every time.", icon: "KEY" },
    { title: "Mobile PWA", desc: "Phone client runs in browser as Progressive Web App. iOS Safari, Android Chrome - no installation.", icon: "PWA" },
  ];

  return (
    <section className="landing-section" style={t.sectionAlt}>
      <div style={t.wrap}>
        <h2 style={{ ...t.h2, ...t.center }}>Core Features</h2>
        <p style={{ ...t.p, margin: "0 auto 48px", ...t.center }}>Everything you need for secure remote laptop access</p>
        <div className="landing-grid" style={t.grid3}>
          {items.map((item) => (
            <div key={item.title} style={{ 
              background: "#0f0f0f", 
              border: "1px solid #1a1a1a", 
              borderRadius: 12, 
              padding: 28,
              transition: "all 0.2s"
            }}>
              <IconBox>{item.icon}</IconBox>
              <h3 style={t.h3}>{item.title}</h3>
              <p style={{ ...t.p, fontSize: 14 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { num: "01", title: "Install & Start Agent", desc: "Run npx tetherdesk start on your laptop. Agent starts, generates QR code with pairing token." },
    { num: "02", title: "Scan QR or Enter Key", desc: "Open the URL on your phone, scan QR code, or enter one-time key (TD-XXXXXX). ECDH handshake establishes session key." },
    { num: "03", title: "Control from Anywhere", desc: "WebRTC P2P connection streams your screen. Tap to click, swipe to scroll. Works across different networks." },
  ];

  return (
    <section id="how-it-works" className="landing-section" style={t.sectionAlt}>
      <div style={t.wrap}>
        <h2 style={{ ...t.h2, ...t.center }}>How It Works</h2>
        <p style={{ ...t.p, margin: "0 auto 48px", ...t.center }}>Get connected in three simple steps</p>
        <div className="landing-grid" style={t.grid3}>
          {steps.map((s) => (
            <div key={s.num} style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 48, fontWeight: 800, color: "#4ade80", opacity: 0.2, marginBottom: 16 }}>{s.num}</div>
              <h3 style={t.h3}>{s.title}</h3>
              <p style={{ ...t.p, fontSize: 14, margin: "10px auto 0" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CliDemo() {
  const output = [
    "$ npm install -g tetherdesk",
    "→ Installing tetherdesk...",
    "✓ Installation complete",
    "",
    "$ tetherdesk start",
    "→ Starting server...",
    "→ Creating tunnel...",
    "✓ Server running on http://localhost:3000",
    "✓ Tunnel ready: https://xxx.trycloudflare.com",
    "",
    "  Scan QR code to connect — 30s setup",
  ];

  return (
    <section style={{ ...t.section, padding: "60px 0", background: "#080808" }}>
      <div style={t.wrap}>
        <h2 style={{ ...t.h2, ...t.center }}>Get Started in Seconds</h2>
        <p style={{ ...t.p, margin: "0 auto 48px", ...t.center }}>Install TetherDesk and start accessing your terminal remotely</p>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div className="landing-terminal">
            <div className="landing-terminal-bar">
              <div className="landing-terminal-dot" style={{ background: "#f87171" }} />
              <div className="landing-terminal-dot" style={{ background: "#fbbf24" }} />
              <div className="landing-terminal-dot" style={{ background: "#4ade80" }} />
              <span style={{ color: "#555", fontSize: 12, marginLeft: 8 }}>terminal</span>
            </div>
            <div style={{ padding: "16px 20px", ...t.mono, fontSize: 13, lineHeight: 1.7 }}>
              {output.map((l, i) => (
                <div key={i} style={{ color: l.startsWith("$") ? "#888" : l.startsWith("✓") ? "#4ade80" : l.startsWith("→") ? "#888" : "#ccc", whiteSpace: "pre-wrap" }}>
                  {l}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 32, flexWrap: "wrap" }}>
            {["30s Setup", "0 Configuration", "∞ Possibilities"].map((s) => (
              <span key={s} style={{ fontSize: 13, color: "#4ade80" }}>{s}</span>
            ))}
          </div>
          <p style={{ ...t.center, fontSize: 13, color: "#555", marginTop: 24 }}>
            Free. Open source. Ready in 30 seconds.
          </p>
          <div style={{ ...t.flexCenter, gap: 12, marginTop: 24, flexWrap: "wrap" }}>
            <Link href="/access" style={{ ...t.btn, ...t.btnPrimary }}>Get Remote</Link>
            <a href="https://github.com/wi5nuu/Tetherdesk" style={{ ...t.btn, ...t.btnOutline }} target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
          <p style={{ ...t.center, fontSize: 12, color: "#555", marginTop: 16 }}>No credit card required · Open source · MIT License</p>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const fl = (color = "#666") => ({ color, textDecoration: "none", cursor: "pointer", fontSize: 13, lineHeight: 2 });

  return (
    <footer style={{ borderTop: "1px solid #141414", padding: "48px 0 32px" }}>
      <div style={t.wrap}>
        <div className="landing-grid" style={t.grid2}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#4ade80" }}>TetherDesk</span>
            <p style={{ ...t.p, fontSize: 13, marginTop: 8 }}>Secure remote terminal and desktop access. Connect to your machines from anywhere in the world.</p>
            <p style={{ fontSize: 12, color: "#555", marginTop: 16 }}>© 2026 TetherDesk. All rights reserved.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            <div>
              <p style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Product</p>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <Link href="/access" style={fl()}>Remote</Link>
                <Link href="/access" style={fl()}>Terminal</Link>
                <Link href="/dashboard" style={fl()}>Remote Desktop</Link>
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Resources</p>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <a href="https://github.com/wi5nuu/Tetherdesk" style={fl()} target="_blank" rel="noopener noreferrer">GitHub</a>
                <Link href="/docs" style={fl()}>Documentation</Link>
                <a href="https://github.com/wi5nuu/Tetherdesk/discussions" style={fl()} target="_blank" rel="noopener noreferrer">Community</a>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 32, paddingTop: 24, borderTop: "1px solid #141414", flexWrap: "wrap", fontSize: 12, color: "#444" }}>
          <span>Built with Next.js, WebRTC, and Cloudflare</span>
          <div style={{ display: "flex", gap: 16, marginLeft: "auto" }}>
            <a href="https://github.com/wi5nuu/Tetherdesk" style={fl("#555")} target="_blank" rel="noopener noreferrer">GitHub</a>
            <Link href="/docs" style={fl("#555")}>Docs</Link>
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
  return (
    <div style={t.page}>
      <Navbar />
      <Hero />
      <TerminalDemo />
      <WhyChoose />
      <Features />
      <HowItWorks />
      <CliDemo />
      <Footer />
    </div>
  );
}
