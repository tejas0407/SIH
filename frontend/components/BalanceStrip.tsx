"use client";

import { AlertTriangle, Check } from "lucide-react";
import { AREA_TOLERANCE, SHARE_TOLERANCE, hectares, sqm, toNumber } from "@/lib/format";

interface Props {
  declaredTotal: string;
  parcelAreas: string[];
  shares: string[];
}

/**
 * The balance strip is the heart of the console and stays pinned below the
 * form. A land record is only trustworthy if two sums close: the parcels
 * against the declared Khata total, and the ownership shares against 100%.
 * Recomputing both on every keystroke means a reviewer sees a correction take
 * effect while they are still typing it, instead of after a round trip.
 */
export default function BalanceStrip({ declaredTotal, parcelAreas, shares }: Props) {
  const declared = toNumber(declaredTotal);
  const parcelSum = parcelAreas.reduce((total, value) => total + toNumber(value), 0);
  const areaDelta = parcelSum - declared;
  const areaBalanced = Math.abs(areaDelta) <= AREA_TOLERANCE;

  const shareSum = shares.reduce((total, value) => total + toNumber(value), 0);
  const shareDelta = shareSum - 100;
  const sharesBalanced = Math.abs(shareDelta) <= SHARE_TOLERANCE;

  return (
    <div className="border-t border-rule bg-panel">
      <div className="grid grid-cols-2 divide-x divide-rule">
        <Ledger
          title="Parcel areas against Khata total"
          balanced={areaBalanced}
          rows={[
            { label: `Sum of ${parcelAreas.length} parcels`, value: `${sqm(parcelSum)} m²` },
            { label: "Declared on the record", value: `${sqm(declared)} m²` },
          ]}
          delta={
            areaBalanced
              ? "Balanced"
              : `${areaDelta > 0 ? "+" : "−"}${sqm(Math.abs(areaDelta))} m² (${hectares(
                  Math.abs(areaDelta),
                )} ha)`
          }
          detail={
            areaBalanced
              ? `Within the ${AREA_TOLERANCE} m² survey tolerance`
              : areaDelta > 0
                ? "The parcels claim more land than the Khata declares"
                : "The Khata declares more land than its parcels account for"
          }
        />

        <Ledger
          title="Ownership shares"
          balanced={sharesBalanced}
          rows={[
            { label: `Sum of ${shares.length} shares`, value: `${shareSum.toFixed(2)}%` },
            { label: "Required", value: "100.00%" },
          ]}
          delta={
            sharesBalanced
              ? "Balanced"
              : `${shareDelta > 0 ? "+" : "−"}${Math.abs(shareDelta).toFixed(2)}%`
          }
          detail={
            sharesBalanced
              ? `Within the ±${SHARE_TOLERANCE}% rounding tolerance`
              : shareDelta > 0
                ? "Shares add up to more than the whole holding"
                : "Part of the holding has no recorded owner"
          }
        />
      </div>
    </div>
  );
}

function Ledger({
  title,
  balanced,
  rows,
  delta,
  detail,
}: {
  title: string;
  balanced: boolean;
  rows: { label: string; value: string }[];
  delta: string;
  detail: string;
}) {
  const color = balanced ? "var(--verified)" : "var(--critical)";

  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs text-ink-muted">{title}</span>
        {balanced ? (
          <Check className="h-3.5 w-3.5 shrink-0" style={{ color }} />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color }} />
        )}
      </div>

      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 text-sm">
          <span className="text-ink-muted">{row.label}</span>
          <span className="font-id">{row.value}</span>
        </div>
      ))}

      {/* The rule under the second figure is the footing line of a ledger —
          the delta below it is the number that decides the record. */}
      <div className="mt-1.5 border-t pt-1.5" style={{ borderColor: color }}>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-xs" style={{ color }}>
            {detail}
          </span>
          <span className="font-id text-lg font-medium" style={{ color }}>
            {delta}
          </span>
        </div>
      </div>
    </div>
  );
}
