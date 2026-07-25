"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { generateX25519KeyPair, toBase64Url } from "@tetherdesk/crypto";
import { useToast } from "../../lib/toast";
import { useLang } from "../../lib/lang-context";
import { LangSwitcher } from "../components/LangSwitcher";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QrPhase =
  | { phase: "loading" }
  | { phase: "ready"; qrDataUrl: string; pairingUrl: string; expiresAt: number }
  | { phase: "error"; message: string };

type ApprovalPhase =
  | { status: "idle" }
  | { status: "pending"; sessionId: string; requestedAt: number }
  | { status: "approved"; sessionId: string }
  | { status: "declined"; sessionId: string };

type ActivityEvent = {
  id: string;
  ts: number;
  level: "info" | "warn" | "error" | "success";
  stage: "agent" | "pairing" | "keyexchange" | "approval" | "webrtc" | "connection" | "system";
  message: string;
  sessionId?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}

function getBackendOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

async function getQrOrigin(): Promise<string> {
  const origin = window.location.origin;
  if (!origin.includes("localhost") && !origin.includes("127.0.0.1")) return origin;
  try {
    const resp = await fetch("/api/lan-ip", { cache: "no-store" });
    if (resp.ok) {
      const data = (await resp.json()) as { ok: boolean; data?: { lanIp: string; port: number } };
      if (data.ok && data.data?.lanIp) return `http://${data.data.lanIp}:${data.data.port}`;
    }
  } catch { /* fall through */ }
  return origin;
}

function stageLabel(stage: ActivityEvent["stage"]): string {
  const map: Record<ActivityEvent["stage"], string> = {
    agent: "Agent", pairing: "Pairing", keyexchange: "Key Exchange",
    approval: "Approval", webrtc: "WebRTC", connection: "Connection", system: "System",
  };
  return map[stage] ?? stage;
}

function levelColor(level: ActivityEvent["level"]): string {
  return { info: "#60a5fa", warn: "#fbbf24", error: "#f87171", success: "#4ade80" }[level];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HomePage() {
  const { addToast } = useToast();
  const { tr } = useLang();
  const d = tr.dashboard;
  const [qr, setQr] = useState<QrPhase>({ phase: "loading" });
  const [timeLeft, setTimeLeft] = useState(90);
  const [approval, setApproval] = useState<ApprovalPhase>({ status: "idle" });
  const [agentOnline, setAgentOnline] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [autoApprove, setAutoApprove] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const approvalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const laptopJwtRef = useRef<string | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // --------------------------------------------------------------------------
  // SSE activity log
  // --------------------------------------------------------------------------
  useEffect(() => {
    const es = new EventSource("/api/events");
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    es.onmessage = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data as string) as ActivityEvent;
        setEvents((prev) => {
          const next = [...prev, evt];
          return next.length > 100 ? next.slice(-100) : next;
        });
      } catch { /* ignore malformed */ }
    };

    es.onerror = () => {
      es.close();
      reconnectTimer = setTimeout(() => {
        const newEs = new EventSource("/api/events");
        newEs.onmessage = es.onmessage;
        newEs.onerror = es.onerror;
      }, 3000);
    };

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es.close();
    };
  }, []);

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // --------------------------------------------------------------------------
  // Approval polling — runs whenever there's a sessionId to watch
  // --------------------------------------------------------------------------
  const startApprovalPolling = useCallback((sessionId: string) => {
    if (approvalPollRef.current) clearInterval(approvalPollRef.current);
    currentSessionIdRef.current = sessionId;

    const poll = async () => {
      if (currentSessionIdRef.current !== sessionId) return;
      try {
        const resp = await fetch(
          `/api/pairing/approval?sessionId=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" },
        );
        if (!resp.ok) return; // 404 = no request yet, keep polling
        const json = (await resp.json()) as {
          ok: boolean;
          data?: { status: "pending" | "approved" | "declined"; sessionId?: string; requestedAt?: number };
        };
        if (!json.ok || !json.data) return;
        const { status, requestedAt } = json.data;

        if (status === "pending") {
          setApproval({ status: "pending", sessionId, requestedAt: requestedAt ?? Date.now() });
        } else if (status === "approved") {
          setApproval({ status: "approved", sessionId });
          clearInterval(approvalPollRef.current!);
          approvalPollRef.current = null;
        } else if (status === "declined") {
          setApproval({ status: "declined", sessionId });
          clearInterval(approvalPollRef.current!);
          approvalPollRef.current = null;
        }
      } catch { /* transient — keep polling */ }
    };

    approvalPollRef.current = setInterval(() => { void poll(); }, 2_000);
    void poll(); // immediate first check
  }, []);

  // --------------------------------------------------------------------------
  // Respond to approval request (approve / decline)
  // --------------------------------------------------------------------------
  const respondToApproval = useCallback(async (sessionId: string, approved: boolean) => {
    try {
      const laptopJwt = laptopJwtRef.current;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (laptopJwt) {
        headers["Authorization"] = `Bearer ${laptopJwt}`;
      }
      const resp = await fetch("/api/pairing/approval", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "respond", sessionId, approved }),
      });
      if (resp.ok) {
        setApproval({ status: approved ? "approved" : "declined", sessionId });
        addToast(approved ? "success" : "info", approved ? "Connection approved" : "Connection declined");
        if (approvalPollRef.current) { clearInterval(approvalPollRef.current); approvalPollRef.current = null; }
      }
    } catch (err) {
      addToast("error", "Failed to respond to approval request");
      console.error("Failed to respond to approval:", err);
    }
  }, [addToast]);

  // --------------------------------------------------------------------------
  // QR generation
  // --------------------------------------------------------------------------
  const generateQr = useCallback(async () => {
    setQr({ phase: "loading" });
    setTimeLeft(90);

    try {
      const QRCode = (await import("qrcode")).default;

      // Step 1: Check if the agent has already registered a pairing QR.
      const activeResp = await fetch("/api/pairing/active-qr", { cache: "no-store" });
      if (activeResp.ok) {
        const activeData = (await activeResp.json()) as
          | { ok: true; data: { pairingUrl: string; expiresAt: number } }
          | { ok: false };
        if (activeData.ok && activeData.data.expiresAt > Date.now()) {
          setAgentOnline(true);
          const { pairingUrl, expiresAt } = activeData.data;

          // Extract sessionId from the pairingUrl for approval polling
          try {
            const b64 = pairingUrl.split("/pair/")[1];
            if (b64) {
              const decoded = JSON.parse(base64UrlDecode(b64)) as { sessionId?: string; pairingToken?: string };
              if (decoded.sessionId) {
                startApprovalPolling(decoded.sessionId);
                // Fetch the laptop JWT so we can authenticate approval responses
                const params = new URLSearchParams({ sessionId: decoded.sessionId });
                if (decoded.pairingToken) params.set("pairingToken", decoded.pairingToken);
                void fetch(`/api/pairing/laptop-jwt?${params}`, { cache: "no-store" })
                  .then(r => r.ok ? r.json() : null)
                  .then(data => { if (data?.ok && data.data?.laptopJwt) laptopJwtRef.current = data.data.laptopJwt; })
                  .catch(() => { /* non-fatal — will try on next QR refresh */ });
              }
            }
          } catch { /* best-effort */ }

          const qrDataUrl = await QRCode.toDataURL(pairingUrl, {
            width: 300, margin: 2,
            color: { dark: "#000000", light: "#ffffff" },
            errorCorrectionLevel: "M",
          });
          const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
          setTimeLeft(remaining);
          setQr({ phase: "ready", qrDataUrl, pairingUrl, expiresAt });
          addToast("success", "QR code generated — scan with your phone");
          if (refreshRef.current) clearTimeout(refreshRef.current);
          const msLeft = expiresAt - Date.now() - 5_000;
          refreshRef.current = setTimeout(() => { void generateQr(); }, Math.max(msLeft, 2_000));
          return;
        }
      }

      // Step 2: Agent not running — generate a standalone QR (fallback mode)
      setAgentOnline(false);
      const backendOrigin = getBackendOrigin();
      const qrOrigin = await getQrOrigin();
      const laptopIdentity = generateX25519KeyPair();
      const laptopEphemeral = generateX25519KeyPair();
      const laptopPubKey = toBase64Url(laptopIdentity.publicKey);
      const laptopEphemeralPubKey = toBase64Url(laptopEphemeral.publicKey);

      const resp = await fetch(`${backendOrigin}/api/pairing/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ laptopPubKey, laptopEphemeralPubKey }),
      });

      if (!resp.ok) throw new Error(`Pairing start failed: HTTP ${resp.status}`);

      const data = (await resp.json()) as { ok: boolean; data?: { sessionId: string; pairingToken: string; bearerToken: string } };
      if (!data.ok || !data.data) throw new Error("Invalid response from pairing/start");

      const { sessionId, pairingToken, bearerToken } = data.data;
      // Store the laptop JWT so we can authenticate approval responses
      if (bearerToken) laptopJwtRef.current = bearerToken;
      startApprovalPolling(sessionId);

      const qrPayload = JSON.stringify({ backendOrigin: qrOrigin, pairingToken, sessionId, laptopEphemeralPubKey });
      const b64 = base64UrlEncode(qrPayload);
      const pairingUrl = `${qrOrigin}/pair/${b64}`;
      const expiresAt = Date.now() + 90_000;

      const qrDataUrl = await QRCode.toDataURL(pairingUrl, {
        width: 300, margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });

      setQr({ phase: "ready", qrDataUrl, pairingUrl, expiresAt });
      addToast("success", "QR code ready — scan with your phone");
      if (refreshRef.current) clearTimeout(refreshRef.current);
      refreshRef.current = setTimeout(() => { void generateQr(); }, 80_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setQr({ phase: "error", message: msg });
      addToast("error", `QR generation failed: ${msg}`);
    }
  }, [startApprovalPolling, addToast]);

  // --------------------------------------------------------------------------
  // API key generation
  // --------------------------------------------------------------------------
  const generateApiKeyHandler = useCallback(async () => {
    setApiKeyError(null);
    setApiKey(null);
    try {
      const sid = currentSessionIdRef.current;
      const laptopJwt = laptopJwtRef.current;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (laptopJwt) headers["Authorization"] = `Bearer ${laptopJwt}`;
      const resp = await fetch("/api/access/keys", {
        method: "POST",
        headers,
        body: JSON.stringify(sid ? { sessionId: sid } : {}),
      });
      const data = (await resp.json()) as { ok: boolean; data?: { apiKey: string }; error?: { message: string } };
      if (data.ok && data.data) {
        setApiKey(data.data.apiKey);
        setApiKeyCopied(false);
        addToast("success", "New API key generated — copy it now, it won't be shown again");
      } else {
        setApiKeyError(data.error?.message ?? "Failed to generate key");
        addToast("error", data.error?.message ?? "Failed to generate key");
      }
    } catch {
      setApiKeyError("Network error — could not reach server");
      addToast("error", "Network error — could not reach server");
    }
  }, [addToast]);

  // Countdown timer
  useEffect(() => {
    if (qr.phase !== "ready") return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil(((qr as Extract<QrPhase, { phase: "ready" }>).expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [qr]);

  // Initial load
  useEffect(() => {
    void generateQr();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (refreshRef.current) clearTimeout(refreshRef.current);
      if (approvalPollRef.current) clearInterval(approvalPollRef.current);
    };
  }, [generateQr]);

  // Reset approval state when QR refreshes
  const handleRefreshQr = () => {
    setApproval({ status: "idle" });
    if (approvalPollRef.current) { clearInterval(approvalPollRef.current); approvalPollRef.current = null; }
    currentSessionIdRef.current = null;
    void generateQr();
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const showApprovalModal = approval.status === "pending";
  const pendingSessionId = approval.status === "pending" ? approval.sessionId : null;

  return (
    <div style={s.root}>
      {/* Approval modal */}
      {showApprovalModal && pendingSessionId && (
          <div
            style={s.overlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-title"
            aria-describedby="approval-desc"
            onClick={(e) => { if (e.target === e.currentTarget) setApproval({ status: "idle" }); }}
            onKeyDown={(e) => { if (e.key === "Escape") setApproval({ status: "idle" }); }}
            tabIndex={-1}
            ref={(el) => { el?.focus(); }}
          >
            <div style={s.modal}>
              <div style={s.modalHeader}>
                <span style={s.modalDot} />
                <span style={s.modalLabel}>{d.approvalTitle}</span>
              </div>
              <h2 id="approval-title" style={s.modalTitle}>
                {d.approvalBody}
              </h2>
              <p id="approval-desc" style={s.modalBody}>
                {d.approvalBody}
              </p>
            <div style={s.modalMeta}>
              {d.approvalSession}{" "}
              <code style={s.monoChip}>
                {pendingSessionId.slice(0, 8)}&hellip;{pendingSessionId.slice(-4)}
              </code>
            </div>
            <div style={s.modalActions}>
              <button
                className="btn-allow"
                style={s.allowBtn}
                onClick={() => { void respondToApproval(pendingSessionId, true); }}
              >
                {d.allow}
              </button>
              <button
                className="btn-deny"
                style={s.denyBtn}
                onClick={() => { void respondToApproval(pendingSessionId, false); }}
              >
                {d.deny}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile hamburger menu */}
      <button
        className="dashboard-hamburger"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle navigation menu"
      >
        <span className="dashboard-hamburger-line"></span>
        <span className="dashboard-hamburger-line"></span>
        <span className="dashboard-hamburger-line"></span>
      </button>

      {/* Sidebar overlay for mobile */}
      <div
        className={`dashboard-sidebar-overlay ${sidebarOpen ? 'dashboard-sidebar-overlay-visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <nav className={`dashboard-sidebar ${sidebarOpen ? 'dashboard-sidebar-open' : ''}`} style={s.sidebar} aria-label="TetherDesk navigation">
        <div style={s.sidebarTop}>
          <div style={s.logo}>
            <span style={s.logoMark}>TD</span>
            <span style={s.logoText}>TetherDesk</span>
          </div>
            <div style={s.navSection}>
              <div style={s.navLabel}>Connection</div>
              <div className="nav-item-hover" style={{ ...s.navItem, ...s.navItemActive }}>
                <span style={s.navIcon} aria-hidden="true">&#9675;</span>
                Pair &amp; Control
              </div>
            </div>
            <div style={s.navSection}>
              <div style={s.navLabel}>System</div>
              <div className="nav-item-hover" style={{ ...s.navItem, color: "#444", cursor: "default" }} title="Coming soon">
                <span style={s.navIcon} aria-hidden="true">&#8962;</span>
                Remote Desktop
                <span style={s.navChip}>soon</span>
              </div>
              <div className="nav-item-hover" style={s.navItem}>
                <span style={s.navIcon} aria-hidden="true">&#10003;</span>
                Auto-start
                <span style={s.navChip}>on</span>
              </div>
              <div className="nav-item-hover" style={s.navItem}>
                <span style={s.navIcon} aria-hidden="true">&#9748;</span>
                Prevent Sleep
              </div>
            </div>
        </div>
        <div style={s.sidebarBottom}>
          <div style={s.agentRow}>
            <span
              style={{
                ...s.statusDot,
                background: agentOnline ? "#4ade80" : "#f87171",
              }}
            />
            <span style={s.agentText}>
              {agentOnline ? d.agentOnline : d.agentOffline}
            </span>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="dashboard-content" style={s.content} aria-label="Main content">
        <header style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>{d.pageTitle}</h1>
            <p style={s.pageSubtitle}>
              {d.pageSubtitle}
            </p>
          </div>
          <div style={s.headerRight}>
            <LangSwitcher />
            <span
              style={{
                ...s.pill,
                background: agentOnline ? "#052e16" : "#1a0a0a",
                color: agentOnline ? "#4ade80" : "#f87171",
                border: `1px solid ${agentOnline ? "#166534" : "#7f1d1d"}`,
              }}
            >
              <span
                style={{
                  ...s.pillDot,
                  background: agentOnline ? "#4ade80" : "#f87171",
                }}
              />
              {agentOnline ? d.agentOnline : d.agentOffline}
            </span>
          </div>
        </header>

        {approval.status === "approved" && (
          <div
            style={{
              ...s.banner,
              background: "#052e16",
              border: "1px solid #166534",
              color: "#4ade80",
            }}
            role="status"
          >
            &#10003; {d.approved} &mdash; remote session is active
          </div>
        )}
        {approval.status === "declined" && (
          <div
            style={{
              ...s.banner,
              background: "#1a0505",
              border: "1px solid #7f1d1d",
              color: "#f87171",
            }}
            role="status"
          >
            &times; {d.declined}
          </div>
        )}

        <div className="dashboard-grid" style={s.grid}>
          {/* QR card */}
          <div className="card-hover" style={s.card}>
            <div style={s.cardHeader}>
              <span style={s.cardIcon}>&#9635;</span>
              <div>
                <div style={s.cardTitle}>{d.qrTitle}</div>
                <div style={s.cardSub}>
                  {d.qrSub} &middot;{" "}
                  {qr.phase === "ready"
                    ? `${d.expiresIn} ${timeLeft}s`
                    : "loading…"}
                </div>
              </div>
              {qr.phase === "ready" && (
                <div
                  style={{
                    ...s.timerBadge,
                    background: timeLeft > 20 ? "#052e16" : "#1a0a0a",
                    color: timeLeft > 20 ? "#4ade80" : "#fbbf24",
                    border: `1px solid ${timeLeft > 20 ? "#166534" : "#92400e"}`,
                  }}
                >
                  {timeLeft}s
                </div>
              )}
            </div>

            <div style={s.qrArea}>
              {qr.phase === "loading" && (
                <div style={s.qrPlaceholder}>
                  <div style={s.spinner} aria-hidden="true" />
                  <p style={s.qrPlaceholderText}>Generating secure token&hellip;</p>
                </div>
              )}
              {qr.phase === "ready" && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- data URL, next/image provides no benefit */}
                  <img
                    className="dashboard-qr-img"
                    src={qr.qrDataUrl}
                    alt="Pairing QR Code — scan with your phone"
                    style={s.qrImg}
                  />
                  <div style={s.timerTrack}>
                    <div
                      style={{
                        ...s.timerFill,
                        width: `${(timeLeft / 90) * 100}%`,
                        background: timeLeft > 20 ? "#4ade80" : "#fbbf24",
                      }}
                    />
                  </div>
                </>
              )}
              {qr.phase === "error" && (
                <div style={s.qrError}>
                  <span style={{ fontSize: 24 }}>&#9888;</span>
                  <span style={{ color: "#f87171", fontSize: 13 }}>
                    {qr.message}
                  </span>
                </div>
              )}
            </div>

            <div style={s.cardActions}>
              <button
                className="btn-primary"
                style={
                  qr.phase === "loading"
                    ? { ...s.btnPrimary, opacity: 0.45, cursor: "not-allowed" }
                    : s.btnPrimary
                }
                onClick={handleRefreshQr}
                disabled={qr.phase === "loading"}
              >
                {qr.phase === "loading" ? "Generating…" : d.newQr}
              </button>
              {qr.phase === "ready" && (
                <a
                  href={qr.pairingUrl}
                  className="btn-secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={s.btnSecondary}
                >
                  {d.openOnPhone}                </a>
              )}
            </div>
          </div>

          {/* Clients card */}
          <div className="card-hover" style={s.card}>
            <div style={s.cardHeader}>
              <span style={s.cardIcon}>&#9633;</span>
              <div>
                <div style={s.cardTitle}>{d.clientsTitle}</div>
                <div style={s.cardSub}>{d.clientsSub}</div>
              </div>
              <span style={s.navChip}>
                {approval.status === "approved" ? "1/1 online" : "0/1 online"}
              </span>
            </div>

            <div style={s.clientList}>
              {approval.status === "approved" && (
                <div className="client-row-hover" style={s.clientRow}>
                  <div style={{ ...s.clientDot, background: "#4ade80" }} />
                  <div style={s.clientInfo}>
                    <div style={s.clientName}>Phone</div>
                    <div style={s.clientMeta}>Approved just now</div>
                  </div>
                  <span
                    style={{
                      ...s.pill,
                      background: "#052e16",
                      color: "#4ade80",
                      border: "1px solid #166534",
                      fontSize: 11,
                    }}
                  >
                    Active
                  </span>
                </div>
              )}
              {approval.status !== "approved" && (
                <div style={s.emptyState}>
                  <p style={s.emptyText}>{d.noClients}</p>
                  <p style={s.emptyHint}>{d.noClientsHint}</p>
                </div>
              )}
            </div>

            <div style={s.settingRow}>
              <div style={s.settingLeft}>
                <div style={s.settingLabel}>
                  &#9634; {d.autoApprove}
                </div>
                <div style={s.settingHint}>
                  {d.autoApproveHint}
                </div>
              </div>
              <div
                className="toggle-hover"
                style={autoApprove ? s.toggleOn : s.toggleOff}
                role="switch"
                aria-checked={autoApprove}
                aria-label="Auto-approve"
                tabIndex={0}
                onClick={() => setAutoApprove(!autoApprove)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAutoApprove(!autoApprove); } }}
              />
            </div>
          </div>

          {/* How to pair card */}
          <div className="card-hover" style={{ ...s.card, ...s.wideCard }}>
            <div style={s.cardHeader}>
              <span style={s.cardIcon}>&#8801;</span>
              <div>
                <div style={s.cardTitle}>{d.howTitle}</div>
                <div style={s.cardSub}>{d.howSubtitle}</div>
              </div>
            </div>
            <ol style={s.steps}>
              <li style={s.step}>
                <div style={s.stepNum}>1</div>
                <div>
                  <div style={s.stepTitle}>{d.step1Title}</div>
                  <div style={s.stepHint}>{d.step1Hint}</div>
                  <code style={s.codeChip}>{d.step1Code}</code>
                  <div style={s.stepHint}>{d.step1Hint2}</div>
                </div>
              </li>
              <li style={s.step}>
                <div style={s.stepNum}>2</div>
                <div>
                  <div style={s.stepTitle}>{d.step2Title}</div>
                  <div style={s.stepHint}>{d.step2Hint}</div>
                </div>
              </li>
              <li style={s.step}>
                <div style={s.stepNum}>3</div>
                <div>
                  <div style={s.stepTitle}>{d.step3Title}</div>
                  <div style={s.stepHint}>
                    {d.step3Hint} <strong style={{ color: "#4ade80" }}>{d.step3Allow}</strong> {d.step3Hint2}
                  </div>
                </div>
              </li>
              <li style={s.step}>
                <div style={s.stepNum}>4</div>
                <div>
                  <div style={s.stepTitle}>{d.step4Title}</div>
                  <div style={s.stepHint}>{d.step4Hint}</div>
                </div>
              </li>
            </ol>
          </div>

          {/* Activity log card */}
          <div className="card-hover" style={{ ...s.card, ...s.wideCard }}>
            <div style={s.cardHeader}>
              <span style={s.cardIcon}>&#9654;</span>
              <div>
                <div style={s.cardTitle}>{d.logTitle}</div>
                <div style={s.cardSub}>{d.logSub}</div>
              </div>
              {events.length > 0 && (
                <button
                  className="btn-secondary"
                  style={{ ...s.btnSecondary, fontSize: 11, padding: "4px 14px", minHeight: 28 }}
                  onClick={() => setEvents([])}
                >
                  {d.clearLog}
                </button>
              )}
            </div>
            <div style={s.logPanel}>
              {events.length === 0 && (
                <div style={s.logEmpty}>{d.logEmpty}</div>
              )}
              {events.map((evt) => (
                <div key={evt.id} className="log-row-hover" style={s.logRow}>
                  <span style={{ ...s.logLevel, color: levelColor(evt.level) }}>
                    {evt.level.toUpperCase()}
                  </span>
                  <span style={s.logStage}>{stageLabel(evt.stage)}</span>
                  <span style={s.logMsg}>{evt.message}</span>
                  <span style={s.logTime}>
                    {new Date(evt.ts).toLocaleTimeString()}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* API Key Management card */}
          <div className="card-hover" style={{ ...s.card, ...s.wideCard }}>
            <div style={s.cardHeader}>
              <span style={s.cardIcon}>&#128273;</span>
              <div>
                <div style={s.cardTitle}>{d.apiTitle}</div>
                <div style={s.cardSub}>{d.apiSub}</div>
              </div>
              <button
                className="btn-secondary"
                style={{ ...s.btnSecondary, fontSize: 11, padding: "4px 14px", minHeight: 28 }}
                onClick={generateApiKeyHandler}
              >
                {d.generateKey}
              </button>
            </div>
            <div style={{ padding: "12px 16px" }}>
              {apiKeyError && (
                <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>{apiKeyError}</div>
              )}
              {apiKey && (
                <div style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "10px 14px", marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>{d.keyOnce}:</div>
                  <div style={{ fontFamily: '"SF Mono", "Fira Code", monospace', fontSize: 13, color: "#4ade80", wordBreak: "break-all" }}>
                    {apiKey}
                  </div>
                  <button
                    className="btn-secondary"
                    style={{
                      ...s.btnSecondary, fontSize: 11, padding: "3px 12px", marginTop: 8,
                      ...(apiKeyCopied ? { background: "#166534", borderColor: "#4ade80", color: "#4ade80" } : {}),
                    }}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(apiKey);
                        setApiKeyCopied(true);
                        addToast("success", "API key copied to clipboard");
                        setTimeout(() => setApiKeyCopied(false), 2000);
                      } catch { addToast("error", "Failed to copy API key"); }
                    }}
                  >
                    {apiKeyCopied ? d.copied : d.copyKey}
                  </button>
                </div>
              )}
              {!apiKey && !apiKeyError && (
                <div style={{ fontSize: 12, color: "#555" }}>
                  {d.apiSub}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    minHeight: "100vh",
    backgroundColor: "#080808",
    color: "#e0e0e0",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    fontSize: 14,
    position: "relative",
  },
  hamburger: {
    display: "none",
    position: "fixed",
    top: 16,
    left: 16,
    zIndex: 1001,
    background: "#0d0d0d",
    border: "1px solid #1a1a1a",
    borderRadius: 8,
    padding: 12,
    cursor: "pointer",
    flexDirection: "column",
    gap: 4,
  },
  hamburgerLine: {
    width: 20,
    height: 2,
    backgroundColor: "#e0e0e0",
    borderRadius: 2,
    transition: "all 0.3s",
  },
  sidebarOverlay: {
    display: "none",
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 999,
  },
  sidebar: {
    width: 220,
    flexShrink: 0,
    backgroundColor: "#0d0d0d",
    borderRight: "1px solid #1a1a1a",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "20px 0",
  },
  sidebarOpen: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    transform: "translateX(0)",
  },
  sidebarTop: { display: "flex", flexDirection: "column", gap: 8 },
  sidebarBottom: { padding: "0 16px" },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 16px 16px",
    borderBottom: "1px solid #1a1a1a",
    marginBottom: 8,
  },
  logoMark: {
    width: 28,
    height: 28,
    backgroundColor: "#4ade80",
    color: "#0a0a0a",
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 800,
    flexShrink: 0,
  },
  logoText: {
    fontSize: 15,
    fontWeight: 700,
    color: "#f0f0f0",
    letterSpacing: "-0.02em",
  },
  navSection: { padding: "8px 0" },
  navLabel: {
    padding: "4px 16px",
    fontSize: 10,
    fontWeight: 700,
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 16px",
    color: "#666",
    cursor: "pointer",
    fontSize: 13,
  },
  navItemActive: {
    backgroundColor: "#141414",
    color: "#e0e0e0",
    borderRight: "2px solid #4ade80",
  },
  navIcon: { fontSize: 12, width: 14, textAlign: "center", flexShrink: 0 },
  navChip: {
    marginLeft: "auto",
    backgroundColor: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 10,
    padding: "1px 8px",
    fontSize: 10,
    color: "#666",
  },
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 0",
    borderTop: "1px solid #1a1a1a",
  },
  statusDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  agentText: { fontSize: 12, color: "#555" },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "auto",
    padding: "28px 32px",
    gap: 20,
  },
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#f0f0f0",
    margin: 0,
    letterSpacing: "-0.03em",
  },
  pageSubtitle: { fontSize: 13, color: "#555", margin: "4px 0 0" },
  headerRight: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 500,
  },
  pillDot: { width: 6, height: 6, borderRadius: "50%" },
  banner: { borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 500 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },
  card: {
    backgroundColor: "#0f0f0f",
    border: "1px solid #1c1c1c",
    borderRadius: 12,
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  wideCard: { gridColumn: "1 / -1" },
  cardHeader: { display: "flex", alignItems: "center", gap: 10 },
  cardIcon: { fontSize: 16, color: "#444", flexShrink: 0 },
  cardTitle: { fontSize: 14, fontWeight: 600, color: "#e0e0e0", lineHeight: 1 },
  cardSub: { fontSize: 11, color: "#444", marginTop: 3 },
  qrArea: {
    backgroundColor: "#fff",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 240,
    overflow: "hidden",
  },
  qrPlaceholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    padding: 32,
  },
  qrPlaceholderText: { fontSize: 12, color: "#999", margin: 0 },
  qrImg: {
    width: 220,
    height: 220,
    imageRendering: "pixelated",
    display: "block",
  },
  qrError: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: 24,
  },
  timerBadge: {
    marginLeft: "auto",
    borderRadius: 20,
    padding: "3px 10px",
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },
  timerTrack: {
    width: "85%",
    height: 3,
    backgroundColor: "#e0e0e0",
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  timerFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.8s linear, background 0.5s",
  },
  spinner: {
    width: 28,
    height: 28,
    border: "2.5px solid #e0e0e0",
    borderTopColor: "#4ade80",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  },
  cardActions: { display: "flex", flexDirection: "column", gap: 7 },
  btnPrimary: {
    backgroundColor: "#4ade80",
    color: "#0a0a0a",
    border: "none",
    borderRadius: 7,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  btnSecondary: {
    backgroundColor: "#141414",
    color: "#c0c0c0",
    border: "1px solid #242424",
    borderRadius: 7,
    padding: "9px 16px",
    fontSize: 13,
    cursor: "pointer",
    width: "100%",
    textDecoration: "none",
    display: "block",
    textAlign: "center",
    boxSizing: "border-box",
  },
  clientList: { display: "flex", flexDirection: "column", gap: 8, flex: 1 },
  clientRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    backgroundColor: "#111",
    border: "1px solid #1c1c1c",
    borderRadius: 8,
  },
  clientDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  clientInfo: { flex: 1 },
  clientName: { fontSize: 13, fontWeight: 500, color: "#e0e0e0" },
  clientMeta: { fontSize: 11, color: "#444" },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "20px 0",
  },
  emptyText: { fontSize: 13, color: "#444", margin: 0, fontWeight: 500 },
  emptyHint: { fontSize: 11, color: "#333", margin: 0 },
  settingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTop: "1px solid #161616",
  },
  settingLeft: { flex: 1 },
  settingLabel: { fontSize: 12, color: "#666", fontWeight: 500 },
  settingHint: { fontSize: 11, color: "#333", marginTop: 2 },
  toggleOff: {
    width: 32,
    height: 18,
    backgroundColor: "#222",
    border: "1px solid #333",
    borderRadius: 9,
    cursor: "pointer",
    flexShrink: 0,
    transition: "background-color 0.15s, border-color 0.15s",
  },
  toggleOn: {
    width: 32,
    height: 18,
    backgroundColor: "#166534",
    border: "1px solid #4ade80",
    borderRadius: 9,
    cursor: "pointer",
    flexShrink: 0,
    transition: "background-color 0.15s, border-color 0.15s",
  },
  steps: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    gap: 0,
  },
  step: {
    flex: 1,
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "0 12px 0 0",
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    backgroundColor: "#1a1a1a",
    border: "1px solid #2a2a2a",
    color: "#555",
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  stepTitle: { fontSize: 13, fontWeight: 600, color: "#c0c0c0", marginBottom: 3 },
  stepHint: { fontSize: 11, color: "#444", lineHeight: 1.5 },
  codeChip: {
    display: "inline-block",
    backgroundColor: "#141414",
    border: "1px solid #242424",
    color: "#4ade80",
    borderRadius: 5,
    padding: "2px 8px",
    fontFamily: "monospace",
    fontSize: 11,
    marginTop: 4,
  },
  monoChip: {
    backgroundColor: "#141414",
    border: "1px solid #242424",
    color: "#a0a0a0",
    borderRadius: 4,
    padding: "1px 6px",
    fontFamily: "monospace",
    fontSize: 12,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
    padding: 16,
  },
  modal: {
    backgroundColor: "#111",
    border: "1px solid #252525",
    borderRadius: 14,
    padding: "24px 24px 22px",
    width: "100%",
    maxWidth: 380,
    boxShadow: "0 32px 64px rgba(0,0,0,0.9)",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    marginBottom: 14,
  },
  modalDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#fbbf24",
    flexShrink: 0,
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#777",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: "#f0f0f0",
    margin: "0 0 8px",
    lineHeight: 1.3,
  },
  modalBody: {
    fontSize: 13,
    color: "#777",
    margin: "0 0 14px",
    lineHeight: 1.6,
  },
  modalMeta: { fontSize: 12, color: "#444", marginBottom: 18 },
  modalActions: { display: "flex", gap: 8 },
  allowBtn: {
    flex: 1,
    backgroundColor: "#4ade80",
    color: "#0a0a0a",
    border: "none",
    borderRadius: 8,
    padding: "11px 0",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  denyBtn: {
    flex: 1,
    backgroundColor: "#141414",
    color: "#f87171",
    border: "1px solid #2a1212",
    borderRadius: 8,
    padding: "11px 0",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  logPanel: {
    maxHeight: 220,
    overflowY: "auto",
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
    fontSize: 12,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "4px 0",
  },
  logEmpty: {
    color: "#444",
    fontSize: 12,
    padding: "12px 0",
    textAlign: "center",
  },
  logRow: {
    display: "flex",
    gap: 8,
    alignItems: "baseline",
    padding: "3px 2px",
    borderRadius: 4,
    borderBottom: "1px solid #111",
  },
  logLevel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    width: 48,
    flexShrink: 0,
  },
  logStage: {
    color: "#555",
    fontSize: 11,
    width: 90,
    flexShrink: 0,
  },
  logMsg: {
    color: "#c0c0c0",
    flex: 1,
    wordBreak: "break-word",
  },
  logTime: {
    color: "#333",
    fontSize: 10,
    flexShrink: 0,
  },
};

