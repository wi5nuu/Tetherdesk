// @ts-check
import { baseConfig } from "@tetherdesk/config/eslint.base.js";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  ...baseConfig,
  {
    // Wire in the react-hooks plugin so eslint-disable comments referencing
    // react-hooks/exhaustive-deps are recognized correctly.
    plugins: {
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
    },
  },
  {
    // Next.js pages, layouts, and route handlers require default exports —
    // this is a framework constraint enforced by the file-system router.
    // Override the no-default-exports rule for these files only.
    files: [
      "app/**/page.tsx",
      "app/**/layout.tsx",
      "app/**/loading.tsx",
      "app/**/error.tsx",
      "app/**/not-found.tsx",
      "app/**/route.ts",
      "app/**/(pwa)/**/page.tsx",
      "app/**/(pwa)/**/layout.tsx",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
];
