import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        panel: "var(--panel)",
        well: "var(--well)",
        ink: { DEFAULT: "var(--ink)", muted: "var(--ink-muted)" },
        rule: { DEFAULT: "var(--rule)", strong: "var(--rule-strong)" },
        verified: { DEFAULT: "var(--verified)", wash: "var(--verified-wash)" },
        review: { DEFAULT: "var(--review)", wash: "var(--review-wash)" },
        critical: { DEFAULT: "var(--critical)", wash: "var(--critical-wash)" },
        focus: { DEFAULT: "var(--focus)", wash: "var(--focus-wash)" },
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "IBM Plex Sans Devanagari", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Tightened scale: this is a dense console, not a landing page.
        "2xs": ["11px", "15px"],
        xs: ["12px", "17px"],
        sm: ["13px", "19px"],
        base: ["14px", "21px"],
        lg: ["16px", "23px"],
        xl: ["19px", "26px"],
        "2xl": ["23px", "30px"],
      },
      borderRadius: { DEFAULT: "3px", sm: "2px", md: "4px" },
    },
  },
  plugins: [],
};

export default config;
