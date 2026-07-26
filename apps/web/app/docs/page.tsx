"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useLang } from "../../lib/lang-context";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh", background: "#0a0a0a", color: "#e0e0e0",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  container: { display: "flex", width: "100%", maxWidth: "var(--page-max)", margin: "0 auto", padding: "0 var(--page-padding)", gap: 40, position: "relative" as const },
  sidebar: {
    width: 240, flexShrink: 0, position: "sticky" as const, top: 80, maxHeight: "calc(100vh - 100px)",
    overflowY: "auto" as const, background: "#0d0d0d", border: "1px solid #1f1f1f",
    borderRadius: 10, padding: "20px 0",
  },
  sidebarTitle: { fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase" as const, letterSpacing: "0.1em", padding: "0 20px", marginBottom: 12 },
  tocItem: { 
    color: "#888", textDecoration: "none", display: "block", padding: "6px 20px", 
    fontSize: 13, cursor: "pointer", transition: "all 0.2s", borderLeft: "2px solid transparent"
  },
  tocItemActive: { color: "#4ade80", borderLeft: "2px solid #4ade80", background: "#0a1a0f" },
  main: { flex: 1, minWidth: 0 },
  wrap: { maxWidth: 820, width: "100%" },
  hero: { padding: "40px 0", textAlign: "center" as const },
  h1: { fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 16, lineHeight: 1.1 },
  sub: { fontSize: 16, color: "#999", maxWidth: 560, margin: "0 auto", lineHeight: 1.6 },
  section: { padding: "48px 0", borderTop: "1px solid #141414" },
  h2: { fontSize: 28, fontWeight: 700, marginBottom: 20, color: "#f0f0f0", letterSpacing: "-0.02em" },
  h3: { fontSize: 20, fontWeight: 600, marginBottom: 12, color: "#e0e0e0", marginTop: 32 },
  h4: { fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#ccc", marginTop: 24 },
  p: { fontSize: 15, lineHeight: 1.8, color: "#aaa", marginBottom: 16 },
  code: {
    fontFamily: '"SF Mono", "Fira Code", "Roboto Mono", monospace',
    fontSize: 13, background: "#111", border: "1px solid #222",
    borderRadius: 6, padding: "2px 8px", color: "#4ade80",
  },
  codeBlockWrapper: { position: "relative" as const, marginBottom: 24 },
  codeBlock: {
    fontFamily: '"SF Mono", "Fira Code", "Roboto Mono", monospace',
    fontSize: 13, background: "#0d0d0d", border: "1px solid #1f1f1f",
    borderRadius: 8, padding: "20px 24px", color: "#ccc",
    lineHeight: 1.8, whiteSpace: "pre-wrap" as const,
    overflowX: "auto" as const,
  },
  copyBtn: {
    position: "absolute" as const, top: 12, right: 12,
    background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6,
    padding: "6px 12px", fontSize: 12, color: "#888", cursor: "pointer",
    transition: "all 0.2s",
  },
  copyBtnCopied: { background: "#166534", color: "#4ade80", borderColor: "#4ade80" },
  ul: { paddingLeft: 24, marginBottom: 20, color: "#aaa", lineHeight: 2, fontSize: 15 },
  card: {
    background: "#111", border: "1px solid #1f1f1f", borderRadius: 10,
    padding: "24px 28px", marginBottom: 20,
  },
  cardTitle: { fontSize: 15, fontWeight: 600, color: "#4ade80", marginBottom: 8 },
  cardDesc: { fontSize: 14, color: "#999", lineHeight: 1.7 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginBottom: 24 },
  note: {
    background: "#0a1a0f", border: "1px solid #166534", borderRadius: 8,
    padding: "16px 20px", fontSize: 14, color: "#4ade80", lineHeight: 1.7, marginBottom: 24,
  },
  warning: {
    background: "#1a1000", border: "1px solid #664400", borderRadius: 8,
    padding: "16px 20px", fontSize: 14, color: "#fbbf24", lineHeight: 1.7, marginBottom: 24,
  },
  footer: {
    borderTop: "1px solid #141414", padding: "40px 0", marginTop: 60,
    textAlign: "center" as const, fontSize: 13, color: "#555",
  },
};




function Code({ children }: { children: string }) {
  return <span style={s.code}>{children}</span>;
}

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        typeof children === "string" ? children.replace(/\$ /g, "").replace(/\nOutput:[\s\S]*$/, "").trim() : ""
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  return (
    <div style={s.codeBlockWrapper}>
      <button
        className="btn-secondary"
        style={{ ...s.copyBtn, ...(copied ? s.copyBtnCopied : {}) }}
        onClick={handleCopy}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <div style={s.codeBlock}>{children}</div>
    </div>
  );
}

export default function DocsPage() {
  const { tr } = useLang();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = tr.docs as any;
  const [activeId, setActiveId] = useState<string>("quickstart");
  const [tocItems, setTocItems] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    setTocItems([
      { id: "quickstart", label: d.quickStart as string },
      { id: "installation", label: d.installation as string },
      { id: "access-keys", label: d.accessKeys as string },
      { id: "three-ways", label: d.twoWays as string },
      { id: "dashboard", label: d.usingDashboard as string },
      { id: "pairing-flow", label: d.pairingFlow as string },
      { id: "troubleshooting", label: d.troubleshooting as string },
      { id: "cli-commands", label: d.cliCommands as string },
      { id: "faq", label: d.faq as string },
    ]);
  }, [d]);

  // IntersectionObserver for active section tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px" }
    );
    for (const { id } of tocItems) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [tocItems]);

  return (
    <div style={s.page}>
      <Navbar />
      <div className="docs-hero" style={s.hero}>
        <h1 style={s.h1}>{d.heroTitle}</h1>
        <p style={s.sub}>{d.heroSub}</p>
      </div>

      <div className="docs-wrap" style={s.container}>

        {/* Sticky Table of Contents Sidebar */}
        <div className="docs-sidebar" style={s.sidebar}>
          <div style={s.sidebarTitle}>{d.onThisPage}</div>
          {tocItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="link-landing"
              style={{ ...s.tocItem, ...(activeId === item.id ? s.tocItemActive : {}) }}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(item.id);
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {item.label}
            </a>
          ))}
        </div>

        {/* Main content */}
        <div style={s.main}>
          <div className="docs-wrap" style={s.wrap}>
          <section id="quickstart" style={s.section}>
          <h2 style={s.h2}>{d.quickStart}</h2>
          <div style={s.note}>{d.note1}</div>

          <p style={s.p}>{d.qsRun}</p>
          <CodeBlock>{`npx tetherdesk`}</CodeBlock>

          <p style={s.p}>{d.qsOutput}</p>
          <CodeBlock>{`PS C:\\Users\\Legion> npx tetherdesk

TetherDesk

  Using saved backend: https://tetherdesk-five.vercel.app
  Config saved to C:\\Users\\Legion\\.tetherdesk\\config.json

[1/1] Starting TetherDesk agent…

 TetherDesk is running!

  Dashboard: https://tetherdesk-five.vercel.app/dashboard

  Waiting for access key…
  Press Ctrl+C to stop.

Agent initialized with persistent identity keypair

=== TetherDesk Pairing ===
Scan this QR code with your phone:


Session ID: XPbIlbgNQivsd3bC
Pairing token expires in 90 seconds.

  [QR code — scan with phone camera]

Open https://tetherdesk-five.vercel.app/dashboard on your laptop to approve the connection.

WebSocket failed — falling back to long-poll signaling
Signaling connected

  ╔══════════════════════════════════╗
  ║       YOUR ACCESS KEY            ║
  ╠══════════════════════════════════╣
  ║   TD-IU5RqiQh9ZAz0fuQafWV7Q      ║
  ╚══════════════════════════════════╝

  Steps:
  1. Open dashboard: https://tetherdesk-five.vercel.app/dashboard
  2. Enter key above in the "Access Key" field
  3. Click Allow on this laptop when prompted
  4. Your phone can now control this laptop

  (Key expires in 90 seconds — a new one will appear automatically)`}</CodeBlock>

          <p style={s.p}>{d.qsPhoneSteps}</p>
          <ol style={s.ul}>
            <li>
              {(() => {
                const parts = d.qsPhone1.split("{url}");
                if (parts.length === 2) {
                  return <>{parts[0]}<Code>https://tetherdesk-five.vercel.app/access</Code>{parts[1]}</>;
                }
                const parts2 = d.qsPhone1.split("{key}");
                if (parts2.length === 2) {
                  return <>{parts2[0]}<Code>TD-IU5RqiQh9ZAz0fuQafWV7Q</Code>{parts2[1]}</>;
                }
                return d.qsPhone1;
              })()}
            </li>
            <li>{(() => { const p = d.qsPhone2.split("{key}"); return p.length === 2 ? <>{p[0]}<Code>TD-IU5RqiQh9ZAz0fuQafWV7Q</Code>{p[1]}</> : d.qsPhone2; })()}</li>
            <li>{d.qsPhone3}</li>
            <li>{d.qsPhone4}</li>
          </ol>
        </section>

        {/* Installation */}
        <section id="installation" style={s.section}>
          <h2 style={s.h2}>{d.installation}</h2>

          <h3 style={s.h3}>{d.installOptA}</h3>
          <p style={s.p}>{d.installOptADesc}</p>
          <CodeBlock>{`npx tetherdesk`}</CodeBlock>

          <h3 style={s.h3}>{d.installOptB}</h3>
          <p style={s.p}>{d.installOptBDesc}</p>
          <CodeBlock>{`npm install -g tetherdesk
tetherdesk`}</CodeBlock>

          <h3 style={s.h3}>{d.installOptC}</h3>
          <CodeBlock>{`pnpm add -g tetherdesk
tetherdesk`}</CodeBlock>

          <h3 style={s.h3}>{d.requirements}</h3>
          <ul style={s.ul}>
            <li>{d.reqNode}</li>
            <li>{d.reqNpm}</li>
            <li>{d.reqOs}</li>
            <li>{d.reqNet}</li>
            <li>{d.reqPhone}</li>
          </ul>

          <div style={s.note}>{d.reqNote}</div>
        </section>

        {/* Access Keys */}
        <section id="access-keys" style={s.section}>
          <h2 style={s.h2}>{d.keysTitle}</h2>
          <p style={s.p}>{d.keysSub}</p>

          <div className="docs-grid" style={s.grid2}>
            <div style={{ ...s.card, borderColor: "#166534" }}>
              <div style={s.cardTitle}>{d.oneTimeTitle}</div>
              <div style={s.cardDesc}>
                <ul style={{ paddingLeft: 16, marginTop: 6 }}>
                  {d.oneTimeBullets.map((b: string, i: number) => {
                    const hasCmd = b.includes("{cmd}");
                    const hasPrefix = b.includes("{prefix}");
                    if (!hasCmd && !hasPrefix) return <li key={i}>{b}</li>;
                    if (hasCmd) {
                      const p = b.split("{cmd}");
                      return <li key={i}>{p[0]}<Code>tetherdesk pair</Code>{p[1]}</li>;
                    }
                    if (hasPrefix) {
                      const p = b.split("{prefix}");
                      return <li key={i}>{p[0]}<Code>TD-</Code>{p[1]}</li>;
                    }
                    return <li key={i}>{b}</li>;
                  })}
                </ul>
              </div>
            </div>
            <div style={{ ...s.card, borderColor: "#166534" }}>
              <div style={s.cardTitle}>{d.apiKeyTitle}</div>
              <div style={s.cardDesc}>
                <ul style={{ paddingLeft: 16, marginTop: 6 }}>
                  {d.apiKeyBullets.map((b: string, i: number) =>
                    b.includes("dashboard") ? (
                      <li key={i}>
                        {(() => {
                          const parts = b.split("{dashboard}");
                          return <>{parts[0]}<Link href="/dashboard" style={{ color: "#4ade80" }}>{d.dashboard}</Link>{parts[1]}</>;
                        })()}
                      </li>
                    ) : (
                      <li key={i}>{b}</li>
                    )
                  )}
                </ul>
              </div>
            </div>
          </div>

          <div style={s.warning}>
            {(() => {
              const p = d.keysWarning.split("{key}");
              return p.length === 2 ? <>{p[0]}<Code>sk-xxx</Code>{p[1]}</> : d.keysWarning;
            })()}
          </div>
        </section>

        {/* 2 Ways to Connect */}
        <section id="three-ways" style={s.section}>
          <h2 style={s.h2}>{d.twoWaysTitle}</h2>
          <p style={s.p}>{d.twoWaysSub}</p>

          <h3 style={s.h3}>{d.method1Title}</h3>
          <h4 style={s.h4}>{d.method1Steps}</h4>
          <ol style={s.ul}>
            <li>{(() => { const p = d.m1s1.split("{cmd}"); return <>{p[0]}<Code>npx tetherdesk</Code>{p[1]}</>; })()}</li>
            <li>{(() => { const p = d.m1s2.split("{key}"); return <>{p[0]}<Code>TD-XXXXXX</Code>{p[1]}</>; })()}</li>
            <li>{(() => { const p = d.m1s3.split("{url}"); return <>{p[0]}<Code>/access</Code>{p[1]}</>; })()}</li>
            <li>{(() => { const p = d.m1s4.split("{key}"); return <>{p[0]}<Code>TD-XXXXXX</Code>{p[1]}</>; })()}</li>
            <li>{(() => { const p = d.m1s5.split("{allow}"); return <>{p[0]}<span style={{ color: "#4ade80", fontWeight: 600 }}>Allow</span>{p[1]}</>; })()}</li>
            <li>{d.m1s6}</li>
          </ol>
          <div style={s.note}>{d.m1Note}</div>

          <h3 style={s.h3}>{d.method2Title}</h3>
          <p style={s.p}>{d.method2Desc}</p>
          <ol style={s.ul}>
            <li>{(() => { const p = d.m2s1.split("{dashboard}"); return <>{p[0]}<Link href="/dashboard" style={{ color: "#4ade80" }}>{d.dashboard}</Link>{p[1]}</>; })()}</li>
            <li>{(() => { const p = d.m2s2.split("{btn}"); return <>{p[0]}<span style={{ color: "#ccc", fontWeight: 600 }}>Generate Key</span>{p[1]}</>; })()}</li>
            <li>{(() => { const p = d.m2s3.split("{key}"); return <>{p[0]}<Code>sk-xxx</Code>{p[1]}</>; })()}</li>
            <li>{(() => { const p = d.m2s4.split("{url}"); return <>{p[0]}<Code>/access</Code>{p[1]}</>; })()}</li>
            <li>{(() => { const p = d.m2s5.split("{remember}"); return <>{p[0]}<span style={{ color: "#ccc", fontWeight: 600 }}>Remember this key</span>{p[1]}</>; })()}</li>
            <li>{d.m2s6}</li>
          </ol>
          <div style={s.warning}>
            {(() => { const p = d.keysWarning.split("{key}"); return p.length === 2 ? <>{p[0]}<Code>sk-xxx</Code>{p[1]}</> : d.keysWarning; })()}
          </div>
        </section>

        {/* Dashboard */}
        <section id="dashboard" style={s.section}>
          <h2 style={s.h2}>{d.dashTitle}</h2>
          <p style={s.p}>
            {(() => { const p = d.dashSub.split("{dashboard}"); return <>{p[0]}<Link href="/dashboard" style={{ color: "#4ade80" }}>{d.dashboard}</Link>{p[1]}</>; })()}
          </p>
          <ul style={s.ul}>
            {d.dashBullets.map((b: string, i: number) => {
              const colonIdx = b.indexOf("—");
              if (colonIdx === -1) return <li key={i}>{b}</li>;
              const label = b.slice(0, colonIdx).trim();
              const desc = b.slice(colonIdx + 1).trim();
              return <li key={i}><span style={{ color: "#ccc", fontWeight: 600 }}>{label}</span> — {desc}</li>;
            })}
          </ul>
          <p style={s.p}>{d.dashNote}</p>
        </section>

        {/* Pairing Flow */}
        <section id="pairing-flow" style={s.section}>
          <h2 style={s.h2}>{d.pairTitle}</h2>
          <p style={s.p}>{d.pairSub}</p>
          <ol style={s.ul}>
            {d.pairSteps.map((step: string, i: number) => {
              const colonIdx = step.indexOf("—");
              if (colonIdx === -1) return <li key={i}>{step}</li>;
              const label = step.slice(0, colonIdx).trim();
              const desc = step.slice(colonIdx + 1).trim();
              return <li key={i}><span style={{ color: "#ccc", fontWeight: 600 }}>{label}</span> — {desc}</li>;
            })}
          </ol>
          <div style={s.note}>{d.pairNote}</div>
        </section>

        {/* Troubleshooting */}
        <section id="troubleshooting" style={s.section}>
          <h2 style={s.h2}>{d.troubTitle}</h2>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.troubKeyExpired}</div>
            <div style={s.cardDesc}>
              {(() => { const p = d.troubKeyExpiredDesc.split("{key}"); return <>{p[0]}<Code>TD-XXXXXX</Code>{p[1]}</>; })()}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.troubInvalidKey}</div>
            <div style={s.cardDesc}>
              {(() => { const p = d.troubInvalidKeyDesc.split("{prefix}"); return <>{p[0]}<Code>sk-</Code>{p[1]}</>; })()}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.troubNoKey}</div>
            <div style={s.cardDesc}>
              {(() => {
                const t = d.troubNoKeyDesc;
                const parts = t.split("{secret}").flatMap((x: string) => x.split("{config}"));
                return <>{parts[0]}<Code>AGENT_SECRET</Code>{parts[1]}<Code>~/.tetherdesk/config.json</Code>{parts[2]}</>;
              })()}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.troubNoAgent}</div>
            <div style={s.cardDesc}>
              {(() => {
                const p = d.troubNoAgentDesc.split("{cmd}").flatMap((x: string) => x.split("{config}"));
                return <>{p[0]}<Code>npx tetherdesk</Code>{p[1]}<Code>~/.tetherdesk/config.json</Code>{p[2]}</>;
              })()}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.troubDrops}</div>
            <div style={s.cardDesc}>{d.troubDropsDesc}</div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.troubNotFound}</div>
            <div style={s.cardDesc}>
              {(() => {
                const p = d.troubNotFoundDesc.split("{cmd}").flatMap((x: string) => x.split("{install}"));
                return <>{p[0]}<Code>npx tetherdesk</Code>{p[1]}<Code>npm install -g tetherdesk</Code>{p[2]}</>;
              })()}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.troubNoVideo}</div>
            <div style={s.cardDesc}>
              {(() => {
                const p = d.troubNoVideoDesc.split("{pkg}").flatMap((x: string) => x.split("{cmd}"));
                return <>{p[0]}<Code>@roamhq/wrtc</Code>{p[1]}<Code>npm install -g @roamhq/wrtc</Code>{p[2]}</>;
              })()}
            </div>
          </div>
        </section>

        {/* CLI Commands */}
        <section id="cli-commands" style={s.section}>
          <h2 style={s.h2}>{d.cliTitle}</h2>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.cliDefaultTitle}</div>
            <div style={s.cardDesc}>
              {(() => { const p = d.cliDefaultDesc.split("{key}"); return <>{p[0]}<Code>TD-XXXXXX</Code>{p[1]}</>; })()}
            </div>
            <CodeBlock>{`npx tetherdesk

TetherDesk

  Using saved backend: https://tetherdesk-five.vercel.app
  Config saved to C:\\Users\\Legion\\.tetherdesk\\config.json

[1/1] Starting TetherDesk agent…

 TetherDesk is running!

  Dashboard: https://tetherdesk-five.vercel.app/dashboard

  Waiting for access key…
  Press Ctrl+C to stop.

Agent initialized with persistent identity keypair

=== TetherDesk Pairing ===
Scan this QR code with your phone:


Session ID: XPbIlbgNQivsd3bC
Pairing token expires in 90 seconds.

  [QR code — scan with phone camera]

Open https://tetherdesk-five.vercel.app/dashboard on your laptop to approve the connection.

  ╔══════════════════════════════════╗
  ║       YOUR ACCESS KEY            ║
  ╠══════════════════════════════════╣
  ║   TD-IU5RqiQh9ZAz0fuQafWV7Q      ║
  ╚══════════════════════════════════╝

  Steps:
  1. Open dashboard: https://tetherdesk-five.vercel.app/dashboard
  2. Enter key above in the "Access Key" field
  3. Click Allow on this laptop when prompted
  4. Your phone can now control this laptop

  (Key expires in 90 seconds — a new one will appear automatically)`}</CodeBlock>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.cliConfigTitle}</div>
            <div style={s.cardDesc}>
              {(() => { const p = d.cliConfigDesc.split("{path}"); return <>{p[0]}<Code>~/.tetherdesk/config.json</Code>{p[1]}</>; })()}
            </div>
            <CodeBlock>{d.cliConfigExample.join("\n")}</CodeBlock>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.cliPairTitle}</div>
            <div style={s.cardDesc}>
              {(() => { const p = d.cliPairDesc.split("{key}"); return <>{p[0]}<Code>TD-XXXXXX</Code>{p[1]}</>; })()}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.cliStatusTitle}</div>
            <div style={s.cardDesc}>{d.cliStatusDesc}</div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.cliStopTitle}</div>
            <div style={s.cardDesc}>{d.cliStopDesc}</div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.cliLogsTitle}</div>
            <div style={s.cardDesc}>
              {(() => { const p = d.cliLogsDesc.split("{cmd}"); return <>{p[0]}<Code>tail -f</Code>{p[1]}</>; })()}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" style={s.section}>
          <h2 style={s.h2}>{d.faqTitle}</h2>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.faqEncryptQ}</div>
            <div style={s.cardDesc}>{d.faqEncryptA}</div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.faqAccountQ}</div>
            <div style={s.cardDesc}>{d.faqAccountA}</div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.faqPortsQ}</div>
            <div style={s.cardDesc}>{d.faqPortsA}</div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.faqMobileQ}</div>
            <div style={s.cardDesc}>{d.faqMobileA}</div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.faqNoCameraQ}</div>
            <div style={s.cardDesc}>
              {(() => {
                const p = d.faqNoCameraA.split("{key}").flatMap((x: string) => x.split("{apikey}"));
                return <>{p[0]}<Code>TD-XXXXXX</Code>{p[1]}<Code>sk-xxx</Code>{p[2]}</>;
              })()}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.faqAppQ}</div>
            <div style={s.cardDesc}>{d.faqAppA}</div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.faqMultiQ}</div>
            <div style={s.cardDesc}>
              {(() => { const p = d.faqMultiA.split("{cmd}"); return <>{p[0]}<Code>tetherdesk pair</Code>{p[1]}</>; })()}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>{d.faqOsQ}</div>
            <div style={s.cardDesc}>
              {d.faqOsA} <a href="https://github.com/wi5nuu/Tetherdesk" style={{ color: "#4ade80" }} target="_blank" rel="noopener noreferrer">GitHub</a>.
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </div>
  </div>
</div>
  );
}
