"use client";

import { create } from "zustand";

/**
 * Accessibility preferences required by GIGW 3.0 for government portals:
 * user-adjustable text size and a high-contrast mode. Both persist per browser
 * and are applied to <html> so every page and modal inherits them.
 */

const KEY = "dilrmp.a11y";

const MIN = 0.875;
const MAX = 1.375;
const STEP = 0.125;

interface Persisted {
  fontScale: number;
  highContrast: boolean;
}

function read(): Persisted {
  const fallback: Persisted = { fontScale: 1, highContrast: false };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      fontScale:
        typeof parsed.fontScale === "number"
          ? Math.min(MAX, Math.max(MIN, parsed.fontScale))
          : 1,
      highContrast: parsed.highContrast === true,
    };
  } catch {
    return fallback;
  }
}

function apply(state: Persisted) {
  if (typeof document === "undefined") return;
  document.documentElement.style.fontSize = `${(state.fontScale * 100).toFixed(1)}%`;
  if (state.highContrast) document.documentElement.dataset.contrast = "high";
  else delete document.documentElement.dataset.contrast;
}

function persist(state: Persisted) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

interface A11yState extends Persisted {
  hydrated: boolean;
  hydrate: () => void;
  larger: () => void;
  smaller: () => void;
  resetFont: () => void;
  toggleContrast: () => void;
}

export const useA11y = create<A11yState>((set, get) => {
  const commit = (next: Persisted) => {
    apply(next);
    persist(next);
    set(next);
  };
  return {
    fontScale: 1,
    highContrast: false,
    hydrated: false,
    hydrate: () => {
      const s = read();
      apply(s);
      set({ ...s, hydrated: true });
    },
    larger: () => {
      const { fontScale, highContrast } = get();
      commit({ fontScale: Math.min(MAX, +(fontScale + STEP).toFixed(3)), highContrast });
    },
    smaller: () => {
      const { fontScale, highContrast } = get();
      commit({ fontScale: Math.max(MIN, +(fontScale - STEP).toFixed(3)), highContrast });
    },
    resetFont: () => {
      const { highContrast } = get();
      commit({ fontScale: 1, highContrast });
    },
    toggleContrast: () => {
      const { fontScale, highContrast } = get();
      commit({ fontScale, highContrast: !highContrast });
    },
  };
});
