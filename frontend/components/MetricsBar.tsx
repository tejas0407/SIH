"use client";

import { ArrowRight, Fingerprint, Scale, Sigma } from "lucide-react";
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

  const ulpins = draft.parcels.map((p) => p.ulpin).filter(Boolean) as string[];

  return (
    <div className="grid shrink-0 grid-cols-3 gap-px border-b border-rule bg-rule">
      <Card
        icon={<Sigma className="h-3.5 w-3.5" />}
        title="Parcel sum vs declared"
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
        icon={<Scale className="h-3.5 w-3.5" />}
        title="Ownership share"
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

      <Card
        icon={<Fingerprint className="h-3.5 w-3.5" />}
        title="ULPIN · Bhu-Aadhaar"
        primary={
          ulpins.length > 0 ? (
            <span className="font-id text-[13px] tracking-tight">{ulpins[0]}</span>
          ) : (
            <span className="text-ink-faint">— pending survey</span>
          )
        }
        secondary={
          ulpins.length > 1
            ? `+${ulpins.length - 1} more parcel ID${ulpins.length - 1 === 1 ? "" : "s"}`
            : "14-character geohash + check digit"
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
    <div className="bg-panel px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
        {icon}
        {title}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-id text-base leading-none">{primary}</span>
        {chip && (
          <span
            className="shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium"
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
      <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-faint">
        {chip?.tone === "bad" && <ArrowRight className="h-3 w-3" />}
        {secondary}
      </div>
    </div>
  );
}
