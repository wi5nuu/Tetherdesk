"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Lang, TRANSLATIONS } from "./i18n";

type Translations = typeof TRANSLATIONS[Lang];

type LangContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  tr: Translations;
};

const LangContext = createContext<LangContextType>({
  lang: "en",
  setLang: () => {},
  tr: TRANSLATIONS.en,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Persist to localStorage and detect browser language on mount
  useEffect(() => {
    const stored = localStorage.getItem("td:lang") as Lang | null;
    if (stored === "en" || stored === "id") {
      setLangState(stored);
    } else {
      // Auto-detect: if browser language starts with 'id', default to Indonesian
      const browser = navigator.language || "";
      if (browser.startsWith("id")) setLangState("id");
    }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("td:lang", l);
  };

  return (
    <LangContext.Provider value={{ lang, setLang, tr: TRANSLATIONS[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
