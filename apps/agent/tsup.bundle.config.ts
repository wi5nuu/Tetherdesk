import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  outDir: "dist-bundle",
  format: "esm",
  target: "node20",
  platform: "node",
  clean: true,
  // Inject shims untuk import.meta.url, __dirname, __filename di ESM bundle
  shims: true,
  // Bundle semua JS deps kecuali native modules
  noExternal: [
    "commander",
    "ws",
    "jpeg-js",
    "qrcode",
    "qrcode-terminal",
    "@tetherdesk/crypto",
    "@tetherdesk/protocol",
  ],
  // Hanya native .node modules yang tidak bisa di-bundle
  external: [
    "@jitsi/robotjs",
    "screenshot-desktop",
    "@roamhq/wrtc",
  ],
});
