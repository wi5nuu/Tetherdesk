import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./landing.css";
import { ToastWrapper } from "./toast-wrapper";
import { LangProvider } from "../lib/lang-context";

export const metadata: Metadata = {
  title: "TetherDesk",
  description: "Remote laptop control from your phone",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TetherDesk",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

// Next.js requires a default export for layout files — this is a framework
// constraint, not a pattern choice. The no-restricted-syntax rule is overridden
// for Next.js page/layout files in eslint.config.js.
function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body>
        <LangProvider>
          <ToastWrapper>{children}</ToastWrapper>
        </LangProvider>
      </body>
    </html>
  );
}

export default RootLayout;
