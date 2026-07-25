"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "../lib/toast";

export function ToastWrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
