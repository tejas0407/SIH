"use client";

import { CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
import { useT, type StringKey } from "@/lib/i18n";

export type StampKind = "sealed" | "pending" | "discrepancy";

const MAP: Record<StampKind, { color: string; key: StringKey; Icon: typeof CircleCheck }> = {
  sealed: { color: "var(--verified)", key: "sealed", Icon: CircleCheck },
  pending: { color: "var(--review)", key: "pending_inspection", Icon: CircleDashed },
  discrepancy: { color: "var(--critical)", key: "discrepancy", Icon: TriangleAlert },
};

/** Stamp-style status marker matching state Record of Rights ledger conventions. */
export default function StampBadge({ kind, className = "" }: { kind: StampKind; className?: string }) {
  const { color, key, Icon } = MAP[kind];
  const { l, en } = useT();
  return (
    <span className={`stamp ${className}`} style={{ color }}>
      <Icon className="h-3 w-3" />
      <span className="font-vernacular">{l(key)}</span>
      <span className="opacity-50">/</span>
      {en(key)}
    </span>
  );
}
