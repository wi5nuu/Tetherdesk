"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type ToastType = "success" | "error" | "info" | "warning";

type Toast = {
  id: string;
  type: ToastType;
  message: string;
};

type ToastContextValue = {
  addToast: (type: ToastType, message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { addToast: (() => {}) as (type: ToastType, message: string) => void };
  }
  return ctx;
}

const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: "#052e16", border: "#166534", icon: "\u2713" },
  error: { bg: "#1a0505", border: "#7f1d1d", icon: "\u2717" },
  info: { bg: "#0a1628", border: "#1e3a5f", icon: "\u2139" },
  warning: { bg: "#1a1400", border: "#7f5c00", icon: "\u26a0" },
};

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = String(++toastId);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container" style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8,
        maxWidth: 360, width: "calc(100% - 40px)", pointerEvents: "none",
      }}>
        {toasts.map((t) => {
          const c = COLORS[t.type];
          return (
            <div key={t.id} style={{
              background: c.bg, border: `1px solid ${c.border}`,
              borderRadius: 8, padding: "10px 14px",
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 13, color: "#e0e0e0",
              boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
              pointerEvents: "auto",
              animation: "toastIn 0.25s ease-out",
            }}>
              <span style={{ flexShrink: 0, fontSize: 14, color: c.icon === "\u2713" ? "#4ade80" : c.icon === "\u2717" ? "#f87171" : c.icon === "\u26a0" ? "#fbbf24" : "#60a5fa" }}>
                {c.icon}
              </span>
              <span style={{ flex: 1 }}>{t.message}</span>
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14, padding: 0 }}
                aria-label="Dismiss"
              >
                {"\u2715"}
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
