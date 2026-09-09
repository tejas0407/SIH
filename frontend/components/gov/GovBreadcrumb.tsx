"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Lock } from "lucide-react";
import ConfidenceRing from "@/components/ConfidenceRing";
import { exportUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ApprovalStatus, KhataDetail, ValidationFinding } from "@/lib/types";

interface Props {
  record: KhataDetail;
  blocking: ValidationFinding[];
}

const STATUS: Record<ApprovalStatus, { label: string; hi: string; tone: string; pulse?: boolean }> = {
  PENDING: {
    label: "Pending inspection",
    hi: "परीक्षण हेतु लंबित",
    tone: "var(--review)",
    pulse: true,
  },
  AUTO_APPROVED: { label: "Sealed & committed", hi: "सील", tone: "var(--verified)" },
  MANUALLY_APPROVED: { label: "Sealed & committed", hi: "सील", tone: "var(--verified)" },
  REJECTED: { label: "Rejected", hi: "निरस्त", tone: "var(--critical)" },
};

/**
 * The revenue-hierarchy breadcrumb (India → State → District → Tehsil → Village
 * → Khata) with the secure-session shield, plus the record's live status,
 * composite score and export controls. One contextual bar under the masthead.
 */
export default function GovBreadcrumb({ record, blocking }: Props) {
  const v = record.village;
  const status = STATUS[record.approval_status];
  const sig = useSessionSignature(record.khata_id);

  const chain: { label: string; code?: string }[] = [
    { label: "India" },
    v ? { label: v.state, code: stateCode(v.village_code) } : { label: "State" },
    v ? { label: v.district } : { label: "District" },
    v ? { label: v.tehsil } : { label: "Tehsil" },
    v ? { label: `Village: ${v.village_name}`, code: v.village_code } : { label: "Village" },
    { label: `Khata No: ${record.khata_number.padStart(5, "0")}` },
  ];

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule bg-panel-raised px-4 py-1.5">
      {/* hierarchy chain */}
      <nav
        aria-label="Administrative hierarchy"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-2xs text-ink-muted"
      >
        {chain.map((seg, i) => (
          <span key={i} className="flex shrink-0 items-center gap-1">
            {i === 0 ? (
              <Link href="/queue" className="hover:text-ink">
                {seg.label}
              </Link>
            ) : (
              <span className={i === chain.length - 1 ? "font-id text-ink" : ""}>
                {seg.label}
                {seg.code && <span className="text-ink-faint"> ({seg.code})</span>}
              </span>
            )}
            {i < chain.length - 1 && <ChevronRight className="h-3 w-3 text-ink-faint" />}
          </span>
        ))}
      </nav>

      {/* secure session shield */}
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2 py-1 text-2xs"
        style={{
          borderColor: "var(--verified-border)",
          background: "var(--verified-wash)",
          color: "var(--verified)",
        }}
        title="Simulated session signature (SHA-256 of the demo session context)"
      >
        <Lock className="h-3 w-3" />
        Secure Government Session
        <span className="font-id text-ink-faint">{sig ? `${sig.slice(0, 16)}…` : "……"}</span>
      </span>

      {/* record status + score + export */}
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium ${
            status.pulse ? "pulse-amber" : ""
          }`}
          style={{
            color: status.tone,
            borderColor: `color-mix(in srgb, ${status.tone} 40%, transparent)`,
            background: `color-mix(in srgb, ${status.tone} 12%, transparent)`,
          }}
        >
          {status.hi} / {status.label}
        </span>

        {blocking.length > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-2xs font-medium"
            style={{
              color: "var(--critical)",
              borderColor: "var(--critical-border)",
              background: "var(--critical-wash)",
            }}
          >
            <AlertTriangle className="h-3 w-3" />
            {blocking.length}
          </span>
        )}

        <ConfidenceRing value={record.confidence.total_confidence} size={34} />
        <ExportMenu />
      </div>
    </div>
  );
}

function ExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="btn h-7 px-2 text-2xs">
        <Download className="h-3 w-3" />
        Export
        <ChevronDown className="h-3 w-3 text-ink-faint" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-md border border-rule bg-panel py-1 shadow-xl"
          >
            <div className="px-3 py-1.5 text-2xs uppercase tracking-wide text-ink-faint">
              DILRMP dataset · approved records only
            </div>
            <a href={exportUrl("geojson")} className="block px-3 py-1.5 text-sm hover:bg-panel-raised">
              GeoJSON <span className="font-id text-xs text-ink-faint">.geojson</span>
            </a>
            <a href={exportUrl("csv")} className="block px-3 py-1.5 text-sm hover:bg-panel-raised">
              CSV <span className="font-id text-xs text-ink-faint">.csv</span>
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A genuine SHA-256, computed over the demo session context — labelled as
 *  simulated because the inputs are demo data, not a real signing key. */
function useSessionSignature(khataId: string) {
  const reviewerId = useAuth((s) => s.user?.login_id ?? "anon");
  const [hash, setHash] = useState<string | null>(null);
  useEffect(() => {
    const seed = `${khataId}|${reviewerId}|${new Date().toISOString().slice(0, 10)}`;
    if (!globalThis.crypto?.subtle) {
      setHash(seed.split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) >>> 0, 0).toString(16).padStart(16, "0").repeat(4));
      return;
    }
    globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)).then((buf) => {
      setHash(
        Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );
    });
  }, [khataId, reviewerId]);
  return hash;
}

function stateCode(villageCode: string | undefined): string | undefined {
  // Demo village codes look like "UP09MRT031"; surface the numeric state code.
  const m = villageCode?.match(/\d{2}/);
  return m ? m[0] : undefined;
}
