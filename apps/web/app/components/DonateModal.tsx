"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useLang } from "../../lib/lang-context";

// QR code image for the phone number transfer (GoPay / DANA)
const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent("081394882490")}&bgcolor=111111&color=4ade80&qzone=2&format=png`;

export function DonateModal({ onClose }: { onClose: () => void }) {
  const { tr } = useLang();
  const d = tr.donate;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={d.title}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#111", border: "1px solid #1f1f1f", borderRadius: 16,
        padding: "36px 32px", width: "min(400px, 100%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
        position: "relative",
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 16, right: 16,
            background: "none", border: "none", color: "#555",
            fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 4,
            borderRadius: 4, transition: "color 0.15s",
          }}
          className="btn-secondary"
        >
          ✕
        </button>

        {/* Heart icon */}
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, marginBottom: 16,
        }}>
          &#9829;
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#e0e0e0", marginBottom: 8, textAlign: "center" }}>
          {d.title}
        </h2>
        <p style={{ fontSize: 14, color: "#888", textAlign: "center", lineHeight: 1.6, marginBottom: 24, maxWidth: 300 }}>
          {d.subtitle}
        </p>

        {/* QR Code box */}
        <div style={{
          background: "#0a0a0a", border: "1px solid #1f1f1f", borderRadius: 12,
          padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          width: "100%", marginBottom: 16,
        }}>
          <div style={{
            background: "#111111", borderRadius: 8, padding: 8,
            border: "1px solid #2a2a2a",
          }}>
            {/* QR Code rendered as SVG via qrserver */}
            <Image
              src={QR_URL}
              alt="QR Code untuk donasi via GoPay / DANA"
              width={200}
              height={200}
              style={{ display: "block", borderRadius: 4 }}
              unoptimized
            />
          </div>
          <p style={{ fontSize: 12, color: "#888", textAlign: "center", margin: 0 }}>
            {d.scanQr}
          </p>
        </div>

        {/* Phone number */}
        <div style={{
          background: "#0a0a0a", border: "1px solid #1f1f1f", borderRadius: 8,
          padding: "12px 20px", width: "100%", textAlign: "center",
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>{d.phoneLabel}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#4ade80", letterSpacing: "0.05em", fontFamily: '"SF Mono","Fira Code",monospace' }}>
            0813-9488-2490
          </div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>GoPay · DANA</div>
        </div>

        <p style={{ fontSize: 12, color: "#555", textAlign: "center", marginBottom: 20 }}>
          {d.thankYou}
        </p>

        <button
          onClick={onClose}
          className="btn-secondary"
          style={{
            width: "100%", padding: "11px", background: "transparent",
            color: "#888", border: "1px solid #2a2a2a", borderRadius: 8,
            fontSize: 14, fontWeight: 500, cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {d.close}
        </button>
      </div>
    </div>
  );
}
