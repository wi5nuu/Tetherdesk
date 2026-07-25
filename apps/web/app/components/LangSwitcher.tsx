"use client";

import { useLang } from "../../lib/lang-context";

export function LangSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <div
      style={{
        display: "flex", alignItems: "center",
        background: "#111", border: "1px solid #1f1f1f",
        borderRadius: 6, overflow: "hidden",
      }}
      role="group"
      aria-label="Language selector"
    >
      {(["en", "id"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          aria-label={l === "en" ? "English" : "Indonesia"}
          style={{
            padding: "4px 10px", fontSize: 12, fontWeight: 600,
            cursor: "pointer", border: "none", transition: "all 0.15s",
            background: lang === l ? "#4ade80" : "transparent",
            color: lang === l ? "#0a0a0a" : "#555",
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
