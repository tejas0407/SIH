import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        panel: { DEFAULT: "var(--panel)", raised: "var(--panel-raised)" },
        well: "var(--well)",
        ink: { DEFAULT: "var(--ink)", muted: "var(--ink-muted)", faint: "var(--ink-faint)" },
        rule: { DEFAULT: "var(--rule)", strong: "var(--rule-strong)" },
        verified: {
          DEFAULT: "var(--verified)",
          wash: "var(--verified-wash)",
          border: "var(--verified-border)",
        },
        review: {
          DEFAULT: "var(--review)",
          wash: "var(--review-wash)",
          border: "var(--review-border)",
        },
        critical: {
          DEFAULT: "var(--critical)",
          wash: "var(--critical-wash)",
          border: "var(--critical-border)",
        },
        focus: { DEFAULT: "var(--focus)", wash: "var(--focus-wash)" },
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans Devanagari", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Tightened scale in rem so the GIGW A- / A / A+ control (which scales
        // the root font-size) moves every label on the page, not just body copy.
        "2xs": ["0.6875rem", "1.35"],
        xs: ["0.75rem", "1.4"],
        sm: ["0.8125rem", "1.45"],
        base: ["0.875rem", "1.5"],
        lg: ["1rem", "1.45"],
        xl: ["1.1875rem", "1.4"],
        "2xl": ["1.4375rem", "1.3"],
      },
      borderRadius: { DEFAULT: "4px", sm: "2px", md: "6px" },
    },
  },
  plugins: [],
};

export default config;
