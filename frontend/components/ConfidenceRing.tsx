"use client";

import { band, BAND_COLOR } from "@/lib/format";

/**
 * The aggregate composite score C_total, drawn as a thin progress ring.
 * Ring colour follows the confidence band so the number and its acceptability
 * read at a glance.
 */
export default function ConfidenceRing({
  value,
  size = 44,
  label = "C_total",
}: {
  value: number; // 0..1
  size?: number;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = BAND_COLOR[band(value)];

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      title={`${label} = ${pct.toFixed(1)}%`}
      role="img"
      aria-label={`${label} ${pct.toFixed(1)} percent`}
    >
      <div
        className="h-full w-full rounded-full"
        style={{ background: `conic-gradient(${color} ${pct}%, var(--rule) 0)` }}
      />
      <div className="absolute inset-[3px] flex flex-col items-center justify-center rounded-full bg-panel">
        <span className="font-id text-[11px] font-semibold leading-none" style={{ color }}>
          {Math.round(pct)}
        </span>
        <span className="text-[7px] uppercase tracking-wider text-ink-faint">{label}</span>
      </div>
    </div>
  );
}
