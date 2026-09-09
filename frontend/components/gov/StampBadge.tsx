"use client";

import { CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";

export type StampKind = "sealed" | "pending" | "discrepancy";

const MAP: Record<StampKind, { color: string; hi: string; en: string; Icon: typeof CircleCheck }> = {
  sealed: { color: "var(--verified)", hi: "सील", en: "SEALED & COMMITTED", Icon: CircleCheck },
  pending: {
    color: "var(--review)",
    hi: "परीक्षण हेतु लंबित",
    en: "PENDING INSPECTION",
    Icon: CircleDashed,
  },
  discrepancy: {
    color: "var(--critical)",
    hi: "निरस्त",
    en: "DISCREPANCY DETECTED",
    Icon: TriangleAlert,
  },
};

/** Stamp-style status marker matching state Record of Rights ledger conventions. */
export default function StampBadge({ kind, className = "" }: { kind: StampKind; className?: string }) {
  const { color, hi, en, Icon } = MAP[kind];
  return (
    <span className={`stamp ${className}`} style={{ color }}>
      <Icon className="h-3 w-3" />
      <span className="font-vernacular">{hi}</span>
      <span className="opacity-50">/</span>
      {en}
    </span>
  );
}
