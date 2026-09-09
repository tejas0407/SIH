"use client";

import { create } from "zustand";

/**
 * Lightweight bilingual support for the government chrome. This is not a full
 * i18n layer — form content stays as extracted — but every institutional label
 * (masthead, utility strip, RoR table headers, statutory notice, action
 * buttons) is authored as an English/Hindi pair, and the language toggle
 * decides which reads first.
 */

export type Lang = "en" | "hi";

const KEY = "dilrmp.lang";

function read(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

interface LangState {
  lang: Lang;
  hydrated: boolean;
  hydrate: () => void;
  setLang: (lang: Lang) => void;
}

export const useLang = create<LangState>((set) => ({
  lang: "en",
  hydrated: false,
  hydrate: () => set({ lang: read(), hydrated: true }),
  setLang: (lang) => {
    try {
      window.localStorage.setItem(KEY, lang);
    } catch {
      /* storage unavailable */
    }
    if (typeof document !== "undefined") document.documentElement.lang = lang;
    set({ lang });
  },
}));

/** Pick the string for the active language. */
export function useT() {
  const lang = useLang((s) => s.lang);
  return (en: string, hi: string) => (lang === "hi" ? hi : en);
}
