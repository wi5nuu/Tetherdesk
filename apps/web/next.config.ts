import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // typedRoutes does not yet understand the Vercel WS beta `SOCKET` export,
  // so it emits a spurious type error on app/api/signal/route.ts.
  // Disabled until Next.js adds SOCKET to its route handler type check.
  // typedRoutes: true,
  webpack(config) {
    // TypeScript files in apps/web use NodeNext-style `.js` import extensions
    // (required for ESM compatibility) but webpack needs to know `.js` imports
    // should resolve to `.ts` / `.tsx` source files during the Next.js build.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
