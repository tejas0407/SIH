"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertOctagon, ChevronDown, Crosshair } from "lucide-react";
import { hectares, sqm, toNumber } from "@/lib/format";
import type { Draft } from "./ReviewForm";
import type { ValidationFinding } from "@/lib/types";
import { useT } from "@/lib/i18n";

interface Props {
  findings: ValidationFinding[];
  draft: Draft;
  onHighlight: () => void;
}

/**
 * The discrepancy drawer sits at the top of the form whenever an arithmetic or
 * syntax invariant fails. It states the failure in full — no reviewer should
 * have to reconstruct the numbers themselves — and offers a single action that
 * jumps to the rows at fault.
 */
export default function DiscrepancyDrawer({ findings, draft, onHighlight }: Props) {
  const [open, setOpen] = useState(true);
  if (findings.length === 0) return null;

  return (
    <div
      className="shrink-0 border-b"
      style={{ borderColor: "var(--critical-border)", background: "var(--critical-wash)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <AlertOctagon className="h-4 w-4 shrink-0 text-critical" />
        <span className="text-xs font-semibold text-critical">
          {findings.length} discrepanc{findings.length === 1 ? "y" : "ies"} detected
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-critical transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-2 px-3 pb-3">
              <ul className="space-y-1.5">
                {findings.map((finding) => (
                  <li
                    key={finding.code + finding.field_path}
                    className="rounded-sm border px-2.5 py-1.5 text-xs leading-relaxed text-ink"
                    style={{
                      borderColor: "var(--critical-border)",
                      background: "var(--panel)",
                    }}
                  >
                    <span className="font-id text-[10px] text-critical">{finding.code}</span>
                    <p className="mt-0.5">{explain(finding, draft)}</p>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={onHighlight}
                className="inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] font-medium text-critical hover:bg-critical-wash"
                style={{ borderColor: "var(--critical-border)" }}
              >
                <Crosshair className="h-3.5 w-3.5" />
                <HighlightLabel />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Turn a finding into a full sentence a reviewer can act on without re-doing
 *  the maths in their head. */
function explain(finding: ValidationFinding, draft: Draft): string {
  if (finding.code === "AREA_SUM_MISMATCH") {
    const declared = toNumber(draft.total_area_sqm);
    const sum = draft.parcels.reduce((t, p) => t + toNumber(p.plot_area_sqm), 0);
    const delta = sum - declared;
    return (
      `Area sum invariance failed: the Khata declares ${hectares(declared)} ha ` +
      `(${sqm(declared)} m²), but the ${draft.parcels.length} extracted Khasra parcels sum to ` +
      `${hectares(sum)} ha (${sqm(sum)} m²) — a difference of ` +
      `${delta > 0 ? "+" : "−"}${sqm(Math.abs(delta))} m² (${hectares(Math.abs(delta))} ha).`
    );
  }
  if (finding.code === "INVALID_OWNER_SHARES") {
    const total = draft.owners.reduce((t, o) => t + toNumber(o.share_percentage), 0);
    return `Ownership shares total ${total.toFixed(2)}%, not 100% — a difference of ${
      total > 100 ? "+" : "−"
    }${Math.abs(total - 100).toFixed(2)}%. Every parcel must be fully accounted for.`;
  }
  if (finding.code === "ORPHAN_OWNER") {
    return "The Khata has no recorded owner. A record cannot be committed without at least one owner holding a share.";
  }
  if (finding.code === "DUPLICATE_KHASRA") {
    return finding.message + " Each Khasra number must appear once in a Khata.";
  }
  if (finding.code === "MISSING_KHATA_NUMBER") {
    return "The Khata number is blank. It is the primary key for the record in the register.";
  }
  return finding.message;
}

function HighlightLabel() {
  const { l, en } = useT();
  return (
    <>
      <span className="font-vernacular">{l("highlight_rows")}</span> / {en("highlight_rows")}
    </>
  );
}
