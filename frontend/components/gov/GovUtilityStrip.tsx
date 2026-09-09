"use client";

import { useEffect, useState } from "react";
import { Contrast, Minus, Plus, RotateCcw } from "lucide-react";
import { useA11y } from "@/lib/a11y";
import { useLang } from "@/lib/i18n";

/**
 * GIGW-3.0 style utility strip: government identity on the left, the standard
 * accessibility and utility controls on the right. A persistent prototype tag
 * makes clear this is a Smart India Hackathon build, not a live GoI service.
 */
export default function GovUtilityStrip() {
  const { fontScale, highContrast, larger, smaller, resetFont, toggleContrast } = useA11y();
  const { lang, setLang } = useLang();
  const clock = useISTClock();

  return (
    <div
      className="flex h-8 w-full shrink-0 items-center justify-between gap-4 px-3 text-2xs"
      style={{ background: "var(--gov-navy)", color: "#cbd5e1", borderBottom: "1px solid #1e293b" }}
    >
      <div className="flex min-w-0 items-center gap-2 truncate">
        <span className="font-medium text-slate-200">भारत सरकार | Government of India</span>
        <span className="hidden text-slate-500 sm:inline">·</span>
        <span className="hidden truncate text-slate-400 sm:inline">
          भू-अभिलेख आधुनिकीकरण कार्यक्रम (DILRMP) Portal
        </span>
        <span className="ml-1 shrink-0 rounded-sm border border-amber-500/40 bg-amber-500/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-400">
          SIH 2026 Prototype
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="hidden items-center gap-0.5 border-r border-slate-700 pr-2 md:flex">
          <UtilBtn label="Decrease text size" onClick={smaller} disabled={fontScale <= 0.875}>
            <Minus className="h-3 w-3" />
            <span className="text-[10px]">A</span>
          </UtilBtn>
          <UtilBtn label="Reset text size" onClick={resetFont}>
            <span className="text-[11px] font-semibold">A</span>
            <RotateCcw className="h-2.5 w-2.5" />
          </UtilBtn>
          <UtilBtn label="Increase text size" onClick={larger} disabled={fontScale >= 1.375}>
            <Plus className="h-3 w-3" />
            <span className="text-[12px]">A</span>
          </UtilBtn>
        </div>

        <UtilBtn
          label={highContrast ? "Switch to normal contrast" : "Switch to high contrast"}
          onClick={toggleContrast}
          pressed={highContrast}
        >
          <Contrast className="h-3 w-3" />
          <span className="hidden text-[10px] lg:inline">
            {highContrast ? "High contrast" : "Contrast"}
          </span>
        </UtilBtn>

        <label className="ml-1 flex items-center gap-1 border-l border-slate-700 pl-2">
          <span className="sr-only">Language</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as "en" | "hi")}
            className="rounded-sm border border-slate-700 bg-transparent px-1 py-0.5 text-[11px] text-slate-200 outline-none focus-visible:border-slate-400"
          >
            <option value="en" className="bg-slate-900">
              English
            </option>
            <option value="hi" className="bg-slate-900">
              हिन्दी
            </option>
          </select>
        </label>

        {clock && (
          <span className="ml-1 hidden border-l border-slate-700 pl-2 font-id text-[11px] text-slate-300 xl:inline">
            {clock}
          </span>
        )}
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
      className={`inline-flex items-center gap-0.5 rounded-sm px-1.5 py-1 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-35 ${
        pressed ? "bg-slate-800 text-white" : ""
      }`}
    >
      {children}
    </button>
  );
}

function useISTClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const date = d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      });
      const time = d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
      });
      setNow(`${date} | ${time} IST`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
