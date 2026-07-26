"use client";

import { useState } from "react";
import Link from "next/link";
import { useLang } from "../../lib/lang-context";

const APP_VERSION = "2.1.28";

export type NavbarVariant = "landing" | "default";

export function Navbar({ variant = "default", onDonate }: { variant?: NavbarVariant; onDonate?: () => void }) {
  const [menu, setMenu] = useState(false);
  const { tr } = useLang();
  const n = tr.nav;

  const links =
    variant === "landing"
      ? [
          { label: n.features, href: "#features" },
          { label: n.howItWorks, href: "#how-it-works" },
          { label: n.docs, href: "/docs" },
        ]
      : [
          { label: n.home, href: "/" },
          { label: n.docs, href: "/docs" },
          { label: n.access, href: "/access" },
          { label: n.dashboard, href: "/dashboard" },
        ];

  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(10,10,10,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid #141414" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: "#4ade80" }}>TetherDesk</span>
          <span style={{ fontSize: 11, color: "#555", padding: "2px 6px", border: "1px solid #222", borderRadius: 4 }}>v{APP_VERSION}</span>
        </Link>

        {/* Desktop nav */}
        <div className="navbar-desktop-links" style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {links.map((l) => (
            <Link key={l.label} href={l.href} className="navbar-link" style={{ color: "#888", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
              {l.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Desktop LangSwitcher */}
          <div className="navbar-desktop-links">
            <LangSwitcher />
          </div>

          {variant === "landing" && (
            <>
              {onDonate && (
                <button
                  onClick={onDonate}
                  className="navbar-desktop-links btn-secondary"
                  style={{ display: "none", alignItems: "center", gap: 6, padding: "6px 14px", background: "transparent", border: "1px solid #2a2a2a", borderRadius: 6, color: "#888", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}
                >
                  ♥ {n.donate}
                </button>
              )}
              <Link href="/access" className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", border: "none", textDecoration: "none", background: "#4ade80", color: "#0a0a0a" }}>
                {n.getStarted}
              </Link>
            </>
          )}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMenu(!menu)}
            className="navbar-menu-btn"
            style={{ background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer" }}
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
            <Link key={l.label} href={l.href} className="mobile-menu-link" style={{ color: "#888", textDecoration: "none", fontSize: 15 }} onClick={() => setMenu(false)}>
              {l.label}
            </Link>
          ))}
          {variant === "landing" && onDonate && (
            <button
              onClick={() => { setMenu(false); onDonate(); }}
              style={{ background: "none", border: "none", color: "#888", textAlign: "left", padding: 0, fontSize: 15, cursor: "pointer" }}
            >
              ♥ {n.donate}
            </button>
          )}
          <div style={{ marginTop: 8 }}>
            <LangSwitcher />
          </div>
        </div>
      )}
    </nav>
  );
}

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
