"use client";

import { ArrowRight, Scale, Sigma } from "lucide-react";
import { AREA_TOLERANCE, SHARE_TOLERANCE, hectares, sqm, toNumber } from "@/lib/format";
import type { Draft } from "./ReviewForm";

/**
 * The live footing of the record, pinned above the form. Two sums decide
 * whether a land record is trustworthy — the parcels against the declared
 * Khata total, and the ownership shares against 100% — and both recompute on
 * every keystroke so a correction shows its effect while it is still being typed.
 */
export default function MetricsBar({ draft }: { draft: Draft }) {
  const declared = toNumber(draft.total_area_sqm);
  const parcelSum = draft.parcels.reduce((t, p) => t + toNumber(p.plot_area_sqm), 0);
  const areaDelta = parcelSum - declared;
  const areaOk = Math.abs(areaDelta) <= AREA_TOLERANCE;

  const shareSum = draft.owners.reduce((t, o) => t + toNumber(o.share_percentage), 0);
  const shareDelta = shareSum - 100;
  const sharesOk = Math.abs(shareDelta) <= SHARE_TOLERANCE && draft.owners.length > 0;

  return (
    <div className="grid shrink-0 grid-cols-2 gap-px border-b border-rule bg-rule">
      <Card
        icon={<Sigma className="h-4 w-4" />}
        title="Area: parcels add up to the total?"
        primary={`${sqm(parcelSum)} m²`}
        secondary={
          <span className="inline-flex items-center gap-1">
            declared {sqm(declared)} m²
          </span>
        }
        chip={
          areaOk
            ? { text: "Balanced", tone: "ok" }
            : {
                text: `${areaDelta > 0 ? "+" : "−"}${hectares(Math.abs(areaDelta))} ha`,
                tone: "bad",
              }
        }
      />

      <Card
        icon={<Scale className="h-4 w-4" />}
        title="Shares: owners add up to 100%?"
        primary={`${shareSum.toFixed(2)} %`}
        secondary={`${draft.owners.length} co-owner${draft.owners.length === 1 ? "" : "s"} · target 100.00%`}
        chip={
          sharesOk
            ? { text: "Balanced", tone: "ok" }
            : {
                text:
                  draft.owners.length === 0
                    ? "No owner"
                    : `${shareDelta > 0 ? "+" : "−"}${Math.abs(shareDelta).toFixed(2)} %`,
                tone: "bad",
              }
        }
      />

    </div>
  );
}

function Card({
  icon,
  title,
  primary,
  secondary,
  chip,
}: {
  icon: React.ReactNode;
  title: string;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  chip?: { text: string; tone: "ok" | "bad" };
}) {
  return (
    <div className="bg-panel px-5 py-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-sm text-ink-muted">
        {icon}
        {title}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-id text-lg leading-none">{primary}</span>
        {chip && (
          <span
            className="shrink-0 rounded-sm border px-2 py-0.5 text-sm font-medium"
            style={{
              color: chip.tone === "ok" ? "var(--verified)" : "var(--critical)",
              background: chip.tone === "ok" ? "var(--verified-wash)" : "var(--critical-wash)",
              borderColor:
                chip.tone === "ok" ? "var(--verified-border)" : "var(--critical-border)",
            }}
          >
            {chip.text}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-sm text-ink-muted">
        {chip?.tone === "bad" && <ArrowRight className="h-3 w-3" />}
        {secondary}
      </div>
    </div>
  );
}
