"use client";

import Link from "next/link";
import { useLang } from "../../lib/lang-context";

export function Footer() {
  const { tr } = useLang();
  const n = tr.nav;

  const fl = (color = "#666") => ({ color, textDecoration: "none", cursor: "pointer", fontSize: 13, lineHeight: 2 } as React.CSSProperties);

  return (
    <footer style={{ borderTop: "1px solid #141414", padding: "48px 0 32px" }}>
      <div className="footer-inner" style={{ width: "100%", maxWidth: "var(--page-max)", margin: "0 auto", padding: "0 var(--page-padding)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#4ade80" }}>TetherDesk</span>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "#888", marginTop: 8 }}>
              {tr.footer.subtitle}
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            <div>
              <p style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{tr.footer.product}</p>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <Link href="/access" className="link-hover" style={fl()}>{n.access}</Link>
                <Link href="/dashboard" className="link-hover" style={fl()}>{n.dashboard}</Link>
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{tr.footer.resources}</p>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <a href="https://github.com/wi5nuu/Tetherdesk" className="link-hover" style={fl()} target="_blank" rel="noopener noreferrer">GitHub</a>
                <Link href="/docs" className="link-hover" style={fl()}>{n.docs}</Link>
                <a href="https://github.com/wi5nuu/Tetherdesk/discussions" className="link-hover" style={fl()} target="_blank" rel="noopener noreferrer">{tr.footer.community}</a>
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
