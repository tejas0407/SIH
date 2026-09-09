"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  Landmark,
  LogOut,
} from "lucide-react";
import ConfidenceRing from "./ConfidenceRing";
import { exportUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ApprovalStatus, KhataDetail, ValidationFinding } from "@/lib/types";

interface Props {
  record: KhataDetail;
  blocking: ValidationFinding[];
}

const STATUS: Record<
  ApprovalStatus,
  { label: string; tone: "amber" | "emerald" | "rose"; pulse?: boolean }
> = {
  PENDING: { label: "Pending review", tone: "amber", pulse: true },
  AUTO_APPROVED: { label: "Verified", tone: "emerald" },
  MANUALLY_APPROVED: { label: "Verified", tone: "emerald" },
  REJECTED: { label: "Rejected", tone: "rose" },
};

const TONE: Record<string, { color: string; wash: string; border: string }> = {
  amber: { color: "var(--review)", wash: "var(--review-wash)", border: "var(--review-border)" },
  emerald: {
    color: "var(--verified)",
    wash: "var(--verified-wash)",
    border: "var(--verified-border)",
  },
  rose: { color: "var(--critical)", wash: "var(--critical-wash)", border: "var(--critical-border)" },
};

export default function ReviewHeader({ record, blocking }: Props) {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  const status = STATUS[record.approval_status];
  const tone = TONE[status.tone];
  const village = record.village;

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-rule bg-panel px-4">
      {/* -------- left: branding + breadcrumb -------- */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-verified-wash">
          <Landmark className="h-4 w-4 text-verified" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[9px] uppercase tracking-[0.14em] text-ink-faint">
            Digital India Land Records Modernization Programme
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Bhu&#8209;Validate AI</span>
            <span className="rounded-sm bg-panel-raised px-1.5 py-px font-id text-[10px] text-ink-muted">
              SIH26018
            </span>
          </div>
        </div>
      </div>

      <nav className="hidden min-w-0 items-center gap-1.5 truncate text-xs text-ink-faint lg:flex">
        <span className="mx-1 text-rule-strong">|</span>
        <Link href="/queue" className="hover:text-ink-muted">
          Queue
        </Link>
        <span>/</span>
        <span className="font-id text-ink-muted">Khata {record.khata_number}</span>
        {village && (
          <>
            <span>/</span>
            <span className="truncate">
              {village.village_name}, {village.district}
            </span>
          </>
        )}
      </nav>

      {/* -------- centre: document state -------- */}
      <div className="ml-auto flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
            status.pulse ? "pulse-amber" : ""
          }`}
          style={{ color: tone.color, background: tone.wash, borderColor: tone.border }}
        >
          {status.tone === "emerald" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: tone.color }}
              aria-hidden
            />
          )}
          {status.label}
        </span>

        <ConfidenceRing value={record.confidence.total_confidence} />

        {blocking.length > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium"
            style={{
              color: "var(--critical)",
              background: "var(--critical-wash)",
              borderColor: "var(--critical-border)",
            }}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {blocking.length} discrepanc{blocking.length === 1 ? "y" : "ies"} detected
          </span>
        )}
      </div>

      {/* -------- right: officer + export -------- */}
      <div className="flex shrink-0 items-center gap-2 border-l border-rule pl-3">
        <ExportMenu />

        {user && (
          <div className="hidden items-center gap-2 sm:flex">
            <div className="text-right leading-tight">
              <div className="text-xs">{user.display_name}</div>
              <div className="text-[10px] uppercase tracking-wide text-ink-faint">
                {user.role}
                {village ? ` · ${village.tehsil}` : ""}
              </div>
            </div>
            <div className="grid h-7 w-7 place-items-center rounded-full bg-panel-raised text-[11px] font-semibold text-ink-muted">
              {initials(user.display_name)}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          title="Sign out"
          className="rounded p-1.5 text-ink-faint hover:bg-panel-raised hover:text-ink-muted"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function ExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn h-8 px-2.5 text-xs"
      >
        <Download className="h-3.5 w-3.5" />
        Export
        <ChevronDown className="h-3.5 w-3.5 text-ink-faint" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-md border border-rule bg-panel py-1 shadow-xl"
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
              DILRMP dataset · approved only
            </div>
            <a
              href={exportUrl("geojson")}
              className="block px-3 py-1.5 text-sm hover:bg-panel-raised"
              onClick={() => setOpen(false)}
            >
              GeoJSON <span className="font-id text-xs text-ink-faint">.geojson</span>
            </a>
            <a
              href={exportUrl("csv")}
              className="block px-3 py-1.5 text-sm hover:bg-panel-raised"
              onClick={() => setOpen(false)}
            >
              CSV <span className="font-id text-xs text-ink-faint">.csv</span>
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
