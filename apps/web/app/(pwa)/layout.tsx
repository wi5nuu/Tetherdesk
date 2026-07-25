"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

export default function PwaLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          // Non-fatal — the app still works without the service worker,
          // it just won't be installable / offline-capable.
          console.warn("Service worker registration failed:", err);
        });
    }
  }, []);

  return <>{children}</>;
}
