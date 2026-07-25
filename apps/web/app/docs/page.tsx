"use client";

import Link from "next/link";

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh", background: "#0a0a0a", color: "#e0e0e0",
    fontFamily: '"Calibri", "Segoe UI", Tahoma, Geneva, sans-serif',
  },
  wrap: { maxWidth: 820, margin: "0 auto", padding: "0 24px" },
  header: {
    borderBottom: "1px solid #141414", padding: "16px 0",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  logo: { fontWeight: 700, fontSize: 18, color: "#4ade80", textDecoration: "none" },
  nav: { display: "flex", gap: 20, fontSize: 14, color: "#888" },
  navLink: { color: "#888", textDecoration: "none", cursor: "pointer" },
  hero: { padding: "64px 0 40px", textAlign: "center" as const },
  h1: { fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 12 },
  sub: { fontSize: 15, color: "#888", maxWidth: 560, margin: "0 auto", lineHeight: 1.6 },
  section: { padding: "32px 0", borderTop: "1px solid #141414" },
  h2: { fontSize: 22, fontWeight: 700, marginBottom: 16, color: "#f0f0f0" },
  h3: { fontSize: 17, fontWeight: 600, marginBottom: 10, color: "#e0e0e0", marginTop: 28 },
  h4: { fontSize: 14, fontWeight: 600, marginBottom: 6, color: "#ccc", marginTop: 20 },
  p: { fontSize: 14, lineHeight: 1.7, color: "#999", marginBottom: 12 },
  code: {
    fontFamily: '"SF Mono", "Fira Code", "Roboto Mono", monospace',
    fontSize: 13, background: "#111", border: "1px solid #222",
    borderRadius: 6, padding: "2px 8px", color: "#4ade80",
  },
  codeBlock: {
    fontFamily: '"SF Mono", "Fira Code", "Roboto Mono", monospace',
    fontSize: 13, background: "#0d0d0d", border: "1px solid #1f1f1f",
    borderRadius: 8, padding: "16px 20px", color: "#ccc",
    lineHeight: 1.7, margin: "12px 0 20px", whiteSpace: "pre-wrap" as const,
    overflowX: "auto" as const,
  },
  ul: { paddingLeft: 20, marginBottom: 16, color: "#999", lineHeight: 1.9, fontSize: 14 },
  card: {
    background: "#111", border: "1px solid #1f1f1f", borderRadius: 10,
    padding: "20px 24px", marginBottom: 16,
  },
  cardTitle: { fontSize: 14, fontWeight: 600, color: "#4ade80", marginBottom: 6 },
  cardDesc: { fontSize: 13, color: "#888", lineHeight: 1.6 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 },
  note: {
    background: "#0a1a0f", border: "1px solid #166534", borderRadius: 8,
    padding: "14px 18px", fontSize: 13, color: "#4ade80", lineHeight: 1.6, marginBottom: 20,
  },
  warning: {
    background: "#1a1000", border: "1px solid #664400", borderRadius: 8,
    padding: "14px 18px", fontSize: 13, color: "#fbbf24", lineHeight: 1.6, marginBottom: 20,
  },
  toc: {
    background: "#0d0d0d", border: "1px solid #1f1f1f", borderRadius: 10,
    padding: "20px 24px", marginBottom: 32,
  },
  tocItem: { color: "#888", textDecoration: "none", display: "block", padding: "4px 0", fontSize: 14, cursor: "pointer", lineHeight: 1.8 },
  tocItemH: { color: "#4ade80" },
  footer: {
    borderTop: "1px solid #141414", padding: "32px 0", marginTop: 48,
    textAlign: "center" as const, fontSize: 13, color: "#555",
  },
};

const TOC_ITEMS = [
  { id: "quickstart", label: "Quick Start (30 seconds)" },
  { id: "installation", label: "Installation" },
  { id: "access-keys", label: "Access Keys Explained" },
  { id: "three-ways", label: "3 Ways to Connect" },
  { id: "dashboard", label: "Using the Dashboard" },
  { id: "pairing-flow", label: "How Pairing Works" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "cli-commands", label: "CLI Command Reference" },
  { id: "faq", label: "FAQ" },
];

function Code({ children }: { children: string }) {
  return <span style={s.code}>{children}</span>;
}

function CodeBlock({ children }: { children: string }) {
  return <div style={s.codeBlock}>{children}</div>;
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={s.navLink}>{children}</Link>;
}

export default function DocsPage() {
  return (
    <div style={s.page}>
      <div style={s.wrap}>
        <header style={s.header}>
          <Link href="/" style={s.logo}>TetherDesk</Link>
          <div style={s.nav}>
            <NavLink href="/">Home</NavLink>
            <NavLink href="/access">Access</NavLink>
            <NavLink href="/dashboard">Dashboard</NavLink>
          </div>
        </header>

        <div style={s.hero}>
          <h1 style={s.h1}>Documentation</h1>
          <p style={s.sub}>
            Everything you need to know about TetherDesk — from first-time setup to advanced usage.
          </p>
        </div>

        {/* Table of Contents */}
        <div style={s.toc}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#888", marginBottom: 12 }}>On this page</div>
          {TOC_ITEMS.map((item) => (
            <a key={item.id} href={`#${item.id}`} style={s.tocItem}>
              {item.label}
            </a>
          ))}
        </div>

        {/* Quick Start */}
        <section id="quickstart" style={s.section}>
          <h2 style={s.h2}>Quick Start — 30 seconds</h2>
          <div style={s.note}>
            No account, no credit card, no port forwarding. Works on any laptop with Node.js 20+.
          </div>
          <div className="docs-grid" style={s.grid2}>
            <div style={s.card}>
              <div style={s.cardTitle}>Step 1: Install</div>
              <div style={s.cardDesc}>
                Run <Code>npx tetherdesk start</Code> on your laptop. This downloads and starts the agent automatically.
              </div>
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}>Step 2: Get Key</div>
              <div style={s.cardDesc}>
                Your terminal shows a <Code>TD-XXXXXX</Code> one-time key and a QR code. Both contain the same pairing information.
              </div>
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}>Step 3: Connect Phone</div>
              <div style={s.cardDesc}>
                Open <Code>https://tetherdesk-five.vercel.app/access</Code> on your phone. Enter the <Code>TD-XXXXXX</Code> key or scan the QR code.
              </div>
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}>Step 4: Approve</div>
              <div style={s.cardDesc}>
                Your laptop shows an approval prompt. Click <span style={{ color: "#4ade80", fontWeight: 600 }}>Allow</span>. Your phone now has remote terminal access.
              </div>
            </div>
          </div>
        </section>

        {/* Installation */}
        <section id="installation" style={s.section}>
          <h2 style={s.h2}>Installation</h2>

          <h3 style={s.h3}>Option A: Run with npx (no install)</h3>
          <p style={s.p}>
            The fastest way to try TetherDesk. No installation required — Node.js downloads and caches the package automatically.
          </p>
          <CodeBlock>{`npx tetherdesk start`}</CodeBlock>

          <h3 style={s.h3}>Option B: Global install with npm</h3>
          <p style={s.p}>
            Install once, use forever. The CLI is a single 111 KB self-contained bundle with all dependencies included.
          </p>
          <CodeBlock>{`npm install -g tetherdesk
tetherdesk start`}</CodeBlock>

          <h3 style={s.h3}>Option C: Global install with pnpm</h3>
          <CodeBlock>{`pnpm add -g tetherdesk
tetherdesk start`}</CodeBlock>

          <h3 style={s.h3}>Requirements</h3>
          <ul style={s.ul}>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>Node.js</span> 20 or later</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>npm</span> 10+ or <span style={{ color: "#ccc", fontWeight: 600 }}>pnpm</span> 9+</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>Operating System</span>: Windows 10/11, macOS 12+, or Linux (x64, arm64)</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>Internet</span>: Laptop needs outbound HTTPS access (no open ports required)</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>Phone</span>: Any smartphone with a modern browser (Chrome, Safari, Edge)</li>
          </ul>

          <div style={s.note}>
            TetherDesk uses Cloudflare Tunnel (Argo) to create an outbound-only secure connection. Your laptop does NOT need a public IP, port forwarding, or router configuration.
          </div>
        </section>

        {/* Access Keys */}
        <section id="access-keys" style={s.section}>
          <h2 style={s.h2}>Access Keys Explained</h2>
          <p style={s.p}>
            TetherDesk uses two types of keys. Understanding the difference helps you choose the right one for your workflow.
          </p>

          <div className="docs-grid" style={s.grid2}>
            <div style={{ ...s.card, borderColor: "#166534" }}>
              <div style={s.cardTitle}>One-Time Key (TD-XXXXXX)</div>
              <div style={s.cardDesc}>
                <ul style={{ paddingLeft: 16, marginTop: 6 }}>
                  <li>Auto-generated by <Code>tetherdesk start</Code></li>
                  <li>Expires after 90 seconds</li>
                  <li>Single-use — consumed after connect</li>
                  <li>Shown alongside QR code in the terminal</li>
                  <li>Best for: first-time setup, guest access, demos</li>
                </ul>
              </div>
            </div>
            <div style={{ ...s.card, borderColor: "#166534" }}>
              <div style={s.cardTitle}>Persistent API Key (sk-xxx)</div>
              <div style={s.cardDesc}>
                <ul style={{ paddingLeft: 16, marginTop: 6 }}>
                  <li>Generated from the <Link href="/dashboard" style={{ color: "#4ade80" }}>dashboard</Link></li>
                  <li>Never expires — use until revoked</li>
                  <li>Can be reused across browser sessions</li>
                  <li>Stored in your browser via "Remember this key"</li>
                  <li>Best for: daily use, multiple devices, automation</li>
                </ul>
              </div>
            </div>
          </div>

          <div style={s.warning}>
            Keep your API key secret. Anyone with your <Code>sk-xxx</Code> key can control your laptop. Revoke unused keys from the dashboard.
          </div>
        </section>

        {/* 3 Ways to Connect */}
        <section id="three-ways" style={s.section}>
          <h2 style={s.h2}>3 Ways to Connect</h2>
          <p style={s.p}>
            TetherDesk offers three methods to pair your phone with your laptop. All three are equally secure.
          </p>

          <h3 style={s.h3}>Method 1: Scan QR Code (Recommended)</h3>
          <p style={s.p}>
            The fastest and most intuitive method. After running <Code>tetherdesk start</Code> on your laptop, a QR code appears in the terminal. On your phone, navigate to the pairing page and use the camera scanner.
          </p>
          <h4 style={s.h4}>Steps:</h4>
          <ol style={s.ul}>
            <li>Run <Code>tetherdesk start</Code> on your laptop</li>
            <li>Note the <Code>pair URL</Code> shown in the terminal, or scan directly</li>
            <li>On your phone, the camera opens automatically</li>
            <li>Point the camera at the QR code on your laptop screen</li>
            <li>The phone reads the pairing payload and starts the handshake</li>
            <li>Approve on your laptop — done!</li>
          </ol>
          <div style={s.note}>
            The QR code encodes a URL like <Code>https://tetherdesk-five.vercel.app/pair/BASE64URL</Code>. You can share this URL directly instead of scanning.
          </div>

          <h3 style={s.h3}>Method 2: One-Time Key (TD-XXXXXX)</h3>
          <p style={s.p}>
            No camera needed. When you run <Code>tetherdesk start</Code>, the terminal displays a one-time key in the format <Code>TD-XXXXXX</Code> (where XXXXXX is a 6-character alphanumeric code). Enter this key on the access page.
          </p>
          <ol style={s.ul}>
            <li>Run <Code>tetherdesk start</Code> on your laptop</li>
            <li>Look for the line: <Code>Access Key: TD-XXXXXX</Code></li>
            <li>Open <Code>/access</Code> on your phone</li>
            <li>Type the key (with or without the <Code>TD-</Code> prefix)</li>
            <li>Click Connect — the phone redirects to the pairing page</li>
            <li>Approve on your laptop</li>
          </ol>

          <h3 style={s.h3}>Method 3: Persistent API Key (sk-xxx)</h3>
          <p style={s.p}>
            Best for daily use. Generate a persistent key from the dashboard and reuse it across sessions. The key never expires.
          </p>
          <ol style={s.ul}>
            <li>Open <Link href="/dashboard" style={{ color: "#4ade80" }}>the dashboard</Link> on any device</li>
            <li>Click <span style={{ color: "#ccc", fontWeight: 600 }}>Generate Key</span></li>
            <li>Copy the <Code>sk-xxx</Code> key — it is shown only once</li>
            <li>Open <Code>/access</Code> on your phone</li>
            <li>Paste or type the key</li>
            <li>Check <span style={{ color: "#ccc", fontWeight: 600 }}>Remember this key</span> to auto-fill next time</li>
            <li>Click Connect — you go directly to the control page</li>
          </ol>
          <div style={s.warning}>
            Unlike one-time keys, API keys do not require laptop-side approval. Keep them secure and revoke unused ones from the dashboard.
          </div>
        </section>

        {/* Dashboard */}
        <section id="dashboard" style={s.section}>
          <h2 style={s.h2}>Using the Dashboard</h2>
          <p style={s.p}>
            The <Link href="/dashboard" style={{ color: "#4ade80" }}>dashboard</Link> is your laptop-side control center. It shows:
          </p>
          <ul style={s.ul}>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>QR Code</span> — refreshed every 90 seconds. Scan with your phone to pair.</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>One-Time Key</span> — the <Code>TD-XXXXXX</Code> key paired with the current QR.</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>Approval Modal</span> — pops up when a phone tries to connect. Click Allow or Deny.</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>Activity Log</span> — real-time stream of pairing and WebRTC events via SSE.</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>API Key Management</span> — generate, copy, list, and revoke persistent API keys.</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>Agent Status</span> — shows whether the local agent is running and connected.</li>
          </ul>
          <p style={s.p}>
            The dashboard can generate QR codes and one-time keys even without the local agent running. For a full pairing experience, run <Code>tetherdesk start</Code> alongside the dashboard.
          </p>
        </section>

        {/* Pairing Flow */}
        <section id="pairing-flow" style={s.section}>
          <h2 style={s.h2}>How Pairing Works</h2>
          <p style={s.p}>
            TetherDesk uses a secure cryptographic handshake based on X25519 ECDH (Elliptic Curve Diffie-Hellman) and HKDF key derivation. Here is the full flow:
          </p>
          <ol style={s.ul}>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>{"Laptop generates ephemeral keypair"}</span> — a one-time X25519 key used only for this pairing session.</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>{"Pairing request"}</span> — laptop sends its ephemeral public key to the server (Redis), which stores it in a hash with a 90-second TTL.</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>{"QR / Key encodes the payload"}</span> — the payload contains the backend origin, pairing token, session ID, and laptop's ephemeral public key.</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>{"Phone reads the payload"}</span> — via camera (QR decode) or URL parameter (access key).</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>{"Phone generates its own ephemeral keypair"}</span> — also X25519, also one-time.</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>{"ECDH shared secret"}</span> — phone computes the shared secret using its ephemeral secret key and the laptop's ephemeral public key.</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>{"HKDF session key"}</span> — the shared secret is fed into HKDF with the session ID as salt, producing a 256-bit AES-GCM key.</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>{"Confirmation"}</span> — phone sends its ephemeral public key and device fingerprint to the server. Laptop polls for this message.</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>{"Approval"}</span> — laptop shows an approval prompt. If allowed, WebRTC signaling begins over the encrypted channel.</li>
            <li><span style={{ color: "#ccc", fontWeight: 600 }}>{"WebRTC connection"}</span> — STUN/TURN via Cloudflare, media and data encrypted with DTLS-SRTP. No server can decrypt the stream.</li>
          </ol>
          <div style={s.note}>
            The session key (<Code>sessionKey</Code>) is derived independently on both sides using ECDH + HKDF and is <span style={{ color: "#ccc", fontWeight: 600 }}>never transmitted</span> over the network. The server only relays ephemeral public keys and ICE candidates.
          </div>
        </section>

        {/* Troubleshooting */}
        <section id="troubleshooting" style={s.section}>
          <h2 style={s.h2}>Troubleshooting</h2>

          <div style={s.card}>
            <div style={s.cardTitle}>"Access key expired"</div>
            <div style={s.cardDesc}>
              One-time keys expire after 90 seconds. Run <Code>tetherdesk start</Code> again to get a fresh key, or use a persistent API key instead. The QR code on the dashboard also refreshes automatically every 90 seconds.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>"Invalid API key"</div>
            <div style={s.cardDesc}>
              Make sure the key starts with <Code>sk-</Code> followed by exactly 32 hexadecimal characters (0-9, a-f). Verify the key was generated from the dashboard and has not been revoked. Generate a new key if needed.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Camera does not open on phone</div>
            <div style={s.cardDesc}>
              Ensure your browser has camera permissions enabled. On iOS Safari, tap the "AA" icon in the address bar and select "Allow Camera". On Android Chrome, tap the lock icon and enable camera. If the camera still does not open, use the one-time key method instead.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Agent not showing in dashboard</div>
            <div style={s.cardDesc}>
              Run <Code>tetherdesk status</Code> to check if the agent is running. If the agent shows "stopped", start it with <Code>tetherdesk start</Code>. The dashboard will show "Agent running" when connected.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Connection drops or lags</div>
            <div style={s.cardDesc}>
              TetherDesk uses WebRTC with Cloudflare TURN relay. If the direct peer-to-peer connection fails, it falls back to the relay, which may add latency. Ensure both devices have a stable internet connection. For best performance, connect both devices to the same WiFi network.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>"Cannot find package tetherdesk"</div>
            <div style={s.cardDesc}>
              Run <Code>npx tetherdesk start</Code> instead of <Code>tetherdesk start</Code>. The <Code>npx</Code> command downloads the package automatically. If you want a global install, use <Code>npm install -g tetherdesk</Code> first, then run <Code>tetherdesk start</Code>.
            </div>
          </div>
        </section>

        {/* CLI Commands */}
        <section id="cli-commands" style={s.section}>
          <h2 style={s.h2}>CLI Command Reference</h2>

          <div style={s.card}>
            <div style={s.cardTitle}>tetherdesk start</div>
            <div style={s.cardDesc}>
              Start the agent, create a secure tunnel, and begin the pairing session. Generates both a QR code and a one-time key. This is the primary command for laptop-side operation.
            </div>
            <CodeBlock>{`npx tetherdesk start

Output:
  ✓ Agent initialized
  ✓ Tunnel ready: https://xxx.trycloudflare.com
  ✓ Pairing URL: https://tetherdesk-five.vercel.app/pair/BASE64URL
    Access Key: TD-A1B2C3
    Scan QR or enter the key on your phone`}</CodeBlock>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>tetherdesk status</div>
            <div style={s.cardDesc}>
              Show the current agent status, backend connectivity, and paired devices. Useful for debugging.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>tetherdesk pair</div>
            <div style={s.cardDesc}>
              Start a new pairing session without restarting the agent. Generates a fresh QR code and one-time key.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>tetherdesk logs</div>
            <div style={s.cardDesc}>
              Tail the local agent log file in real time. Shows signaling events, WebRTC state changes, and errors.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>tetherdesk config [key] [value]</div>
            <div style={s.cardDesc}>
              Get or set configuration values. Without arguments, shows all config. With a key, shows the value. With key and value, sets the config.
            </div>
            <CodeBlock>{`tetherdesk config              # show all config
tetherdesk config backendUrl   # get backend URL
tetherdesk config backendUrl https://example.com  # set backend URL`}</CodeBlock>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>tetherdesk devices</div>
            <div style={s.cardDesc}>
              List all paired devices with their public keys and last connection times.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>tetherdesk destroy</div>
            <div style={s.cardDesc}>
              Stop the agent, remove the config file, and clean up. Use <Code>--yes</Code> to skip the confirmation prompt.
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" style={s.section}>
          <h2 style={s.h2}>FAQ</h2>

          <div style={s.card}>
            <div style={s.cardTitle}>Is my data encrypted?</div>
            <div style={s.cardDesc}>
              Yes. All traffic is end-to-end encrypted. The pairing handshake uses X25519 ECDH + HKDF for key agreement, and the WebRTC data/media channels use DTLS-SRTP (AES-GCM 256). The Cloudflare tunnel provides transport-layer encryption. TetherDesk servers never have access to your session keys or data.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Do I need a TetherDesk account?</div>
            <div style={s.cardDesc}>
              No. TetherDesk does not require any account, registration, or personal information. The backend uses Redis for ephemeral state, and no data is permanently stored.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Do I need to open ports on my router?</div>
            <div style={s.cardDesc}>
              No. TetherDesk uses Cloudflare Tunnel, which creates an outbound-only connection from your laptop. No inbound ports are required. This works behind NAT, corporate firewalls, and CGNAT.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Does it work on iPhone and Android?</div>
            <div style={s.cardDesc}>
              Yes. The phone connects through a browser-based PWA (Progressive Web App). It works on Safari (iOS), Chrome (Android), and any modern mobile browser. Camera QR scanning is supported on both platforms.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Can I use it without a phone camera?</div>
            <div style={s.cardDesc}>
              Yes. Instead of scanning the QR code, you can enter the one-time key (<Code>TD-XXXXXX</Code>) shown in the terminal, or use a persistent API key (<Code>sk-xxx</Code>) generated from the dashboard.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Is there a mobile app?</div>
            <div style={s.cardDesc}>
              TetherDesk uses a PWA (Progressive Web App). On Android, Chrome will prompt you to "Add to Home Screen" for an app-like experience. On iOS, use Safari's Share menu → "Add to Home Screen". The PWA supports offline mode and camera access.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Can multiple phones connect to one laptop?</div>
            <div style={s.cardDesc}>
              Each pairing session supports one phone at a time. To connect a different phone, generate a new pairing session by running <Code>tetherdesk pair</Code> or waiting for the QR code to refresh on the dashboard.
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Is TetherDesk open source?</div>
            <div style={s.cardDesc}>
              Yes. The full source code is available on <a href="https://github.com/wi5nuu/Tetherdesk" style={{ color: "#4ade80" }} target="_blank" rel="noopener noreferrer">GitHub</a> under the MIT license. Contributions, issues, and feature requests are welcome.
            </div>
          </div>
        </section>

        <div style={s.footer}>
          <p>TetherDesk — Open source remote terminal access</p>
          <div style={{ marginTop: 8, display: "flex", justifyContent: "center", gap: 20 }}>
            <Link href="/" style={{ color: "#555", textDecoration: "none" }}>Home</Link>
            <Link href="/access" style={{ color: "#555", textDecoration: "none" }}>Access</Link>
            <Link href="/dashboard" style={{ color: "#555", textDecoration: "none" }}>Dashboard</Link>
            <a href="https://github.com/wi5nuu/Tetherdesk" style={{ color: "#555", textDecoration: "none" }} target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </div>
      </div>
    </div>
  );
}
