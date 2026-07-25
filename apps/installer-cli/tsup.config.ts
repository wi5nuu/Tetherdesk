import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: "esm",
  target: "node20",
  clean: true,
  noExternal: ["@tetherdesk/crypto", "@tetherdesk/protocol"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
