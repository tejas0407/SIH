"use client";

import { Contrast, Minus, Plus, RotateCcw } from "lucide-react";
import { useA11y } from "@/lib/a11y";
import { LANGUAGES, useLang, useT, type Lang } from "@/lib/i18n";

/**
 * GIGW-3.0 style utility strip: government identity on the left, the standard
 * accessibility and language controls on the right.
 */
export default function GovUtilityStrip() {
  const { fontScale, highContrast, larger, smaller, resetFont, toggleContrast } = useA11y();
  const { lang, setLang } = useLang();
  const { l, bi } = useT();

  return (
    <div
      className="flex h-10 w-full shrink-0 items-center justify-between gap-4 px-5 text-xs"
      style={{ background: "var(--gov-navy)", color: "#cbd5e1", borderBottom: "1px solid #1e293b" }}
    >
      <div className="flex min-w-0 items-center gap-2 truncate">
        <span className="truncate font-medium text-slate-200">
          <span className="font-vernacular">{l("gov_india")}</span> | Government of India
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="hidden items-center gap-0.5 border-r border-slate-700 pr-2 md:flex">
          <UtilBtn label="Decrease text size" onClick={smaller} disabled={fontScale <= 0.875}>
            <Minus className="h-3.5 w-3.5" />
            <span className="text-2xs">A</span>
          </UtilBtn>
          <UtilBtn label="Reset text size" onClick={resetFont}>
            <span className="text-xs font-semibold">A</span>
            <RotateCcw className="h-2.5 w-2.5" />
          </UtilBtn>
          <UtilBtn label="Increase text size" onClick={larger} disabled={fontScale >= 1.375}>
            <Plus className="h-3.5 w-3.5" />
            <span className="text-sm">A</span>
          </UtilBtn>
        </div>

        <UtilBtn
          label={highContrast ? "Switch to normal contrast" : "Switch to high contrast"}
          onClick={toggleContrast}
          pressed={highContrast}
        >
          <Contrast className="h-3.5 w-3.5" />
          <span className="hidden text-xs lg:inline">
            {highContrast ? "High contrast" : "Contrast"}
          </span>
        </UtilBtn>

        <label className="ml-1 flex items-center gap-1 border-l border-slate-700 pl-2">
          <span className="sr-only">{bi("language")}</span>
          <select
            value={lang}
            title={bi("language")}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="rounded-sm border border-slate-600 bg-transparent px-2 py-1 text-sm text-slate-100 outline-none focus-visible:border-slate-400"
          >
            {LANGUAGES.map((option) => (
              <option key={option.code} value={option.code} className="bg-slate-900">
                {option.native} + English
              </option>
            ))}
          </select>
        </label>

      </div>
    </div>
  );
}

function UtilBtn({
  children,
  label,
  onClick,
  disabled,
  pressed,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-0.5 rounded-sm px-2 py-1.5 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-35 ${
        pressed ? "bg-slate-800 text-white" : ""
      }`}
    >
      {children}
    </button>
  );
}
