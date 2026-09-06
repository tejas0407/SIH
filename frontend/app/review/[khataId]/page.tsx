"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { ArrowLeft, PenLine } from "lucide-react";
import DocumentViewer from "@/components/DocumentViewer";
import ReviewForm, { type Draft, type Tab } from "@/components/ReviewForm";
import BalanceStrip from "@/components/BalanceStrip";
import SignModal from "@/components/SignModal";
import { fetchKhata, verifyKhata } from "@/lib/api";
import { AREA_TOLERANCE, SHARE_TOLERANCE, pct, toNumber } from "@/lib/format";
import { useReviewStore, type FocusTarget } from "@/lib/store";
import type { KhataDetail, ValidationFinding } from "@/lib/types";

export default function ReviewPage() {
  const { khataId } = useParams<{ khataId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const reviewerId = useReviewStore((s) => s.reviewerId);
  const role = useReviewStore((s) => s.role);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<Tab>("khata");
  const [signOpen, setSignOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  const { data: record, isLoading, error } = useQuery({
    queryKey: ["khata", khataId],
    queryFn: () => fetchKhata(khataId),
  });

  useEffect(() => {
    if (record && !draft) setDraft(toDraft(record));
  }, [record, draft]);

  const verify = useMutation({
    mutationFn: (input: { reason: string; force: boolean }) => {
      if (!draft) throw new Error("nothing to submit");
      return verifyKhata(khataId, {
        khata_number: draft.khata_number,
        fasli_year: draft.fasli_year || null,
        total_area_sqm: draft.total_area_sqm,
        declared_unit: draft.declared_unit || null,
        parcels: draft.parcels.map((p) => ({
          parcel_id: p.parcel_id,
          khasra_number: p.khasra_number,
          plot_area_sqm: p.plot_area_sqm,
          land_classification: p.land_classification || null,
        })),
        owners: draft.owners.map((o) => ({
          owner_id: o.owner_id,
          owner_name_vernacular: o.owner_name_vernacular,
          owner_name_en: o.owner_name_en || null,
          relation_type: o.relation_type || null,
          relative_name: o.relative_name || null,
          share_percentage: o.share_percentage,
        })),
        reviewer_id: reviewerId,
        role,
        reason: input.reason || null,
        force_approve: input.force,
      });
    },
    onSuccess: (response) => {
      setSignOpen(false);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["khata", khataId] });

      if (response.committed) {
        // One small celebration at the one moment that deserves it: a record
        // has entered the official register.
        confetti({ particleCount: 70, spread: 62, origin: { y: 0.7 }, disableForReducedMotion: true });
        setToast({ text: response.message, tone: "ok" });
        setTimeout(() => router.push("/queue"), 1600);
      } else {
        setToast({ text: response.message, tone: "warn" });
      }
    },
    onError: (err: Error) => setToast({ text: err.message, tone: "warn" }),
  });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const boxes = useMemo<FocusTarget[]>(() => {
    if (!record) return [];
    const targets: FocusTarget[] = [];
    record.parcels.forEach((parcel, index) => {
      if (parcel.bbox_json) {
        targets.push({
          key: `parcels.${index}.khasra_number`,
          bbox: parcel.bbox_json,
          confidence: Math.min(...Object.values(parcel.field_confidence ?? { x: 1 })),
          label: `Khasra ${parcel.khasra_number}`,
        });
      }
    });
    record.owners.forEach((owner, index) => {
      if (owner.bbox_json) {
        targets.push({
          key: `owners.${index}.owner_name_vernacular`,
          bbox: owner.bbox_json,
          confidence: Math.min(...Object.values(owner.field_confidence ?? { x: 1 })),
          label: owner.owner_name_en ?? owner.owner_name_vernacular,
        });
      }
    });
    return targets;
  }, [record]);

  /** Client-side mirror of the backend invariants, so the sign button reflects
   *  what the reviewer is looking at rather than the last server response. */
  const liveBlocking = useMemo<ValidationFinding[]>(() => {
    if (!draft) return [];
    const findings: ValidationFinding[] = [];

    const parcelSum = draft.parcels.reduce((t, p) => t + toNumber(p.plot_area_sqm), 0);
    const declared = toNumber(draft.total_area_sqm);
    if (Math.abs(parcelSum - declared) > AREA_TOLERANCE) {
      findings.push({
        code: "AREA_SUM_MISMATCH",
        severity: "CRITICAL",
        field_path: "khata.total_area_sqm",
        message: `Parcel areas total ${parcelSum.toFixed(2)} m² against a declared ${declared.toFixed(2)} m².`,
      });
    }

    const shareSum = draft.owners.reduce((t, o) => t + toNumber(o.share_percentage), 0);
    if (draft.owners.length === 0) {
      findings.push({
        code: "ORPHAN_OWNER",
        severity: "CRITICAL",
        field_path: "owners",
        message: "The Khata has no recorded owner.",
      });
    } else if (Math.abs(shareSum - 100) > SHARE_TOLERANCE) {
      findings.push({
        code: "INVALID_OWNER_SHARES",
        severity: "CRITICAL",
        field_path: "owners.share_percentage",
        message: `Ownership shares total ${shareSum.toFixed(2)}%, not 100%.`,
      });
    }

    if (!draft.khata_number.trim()) {
      findings.push({
        code: "MISSING_KHATA_NUMBER",
        severity: "CRITICAL",
        field_path: "khata.khata_number",
        message: "The Khata number is blank.",
      });
    }

    const seen = new Set<string>();
    draft.parcels.forEach((parcel) => {
      const key = parcel.khasra_number.trim();
      if (key && seen.has(key)) {
        findings.push({
          code: "DUPLICATE_KHASRA",
          severity: "CRITICAL",
          field_path: "parcels",
          message: `Khasra ${key} is listed twice.`,
        });
      }
      seen.add(key);
    });

    return findings;
  }, [draft]);

  if (isLoading || !draft || !record) {
    return <Centered>{error ? (error as Error).message : "Opening the record…"}</Centered>;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-rule bg-panel px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/queue" className="rounded p-1.5 text-ink-muted hover:bg-surface" aria-label="Back to the queue">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base">
              Khata <span className="font-id">{record.khata_number}</span>
              {record.fasli_year && <span className="text-ink-muted"> · {record.fasli_year}</span>}
            </h1>
            <p className="truncate text-xs text-ink-muted">
              {record.village
                ? `${record.village.village_name} · ${record.village.tehsil} · ${record.village.district}, ${record.village.state}`
                : "Village not recorded"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <div className="font-id text-lg leading-none">{pct(record.confidence.total_confidence)}</div>
            <div className="text-2xs text-ink-muted">confidence</div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setSignOpen(true)}>
            <PenLine className="h-4 w-4" />
            Review and sign
          </button>
        </div>
      </header>

      {liveBlocking.length > 0 && (
        <div className="shrink-0 border-b border-critical bg-critical-wash px-4 py-2 text-sm text-critical">
          {liveBlocking[0].message}
          {liveBlocking.length > 1 && (
            <span className="text-ink-muted"> · and {liveBlocking.length - 1} more</span>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-[58]">
          <DocumentViewer imageUrl={record.document_url} boxes={boxes} />
        </section>

        <section className="flex min-w-0 flex-[42] flex-col border-l border-rule bg-surface">
          <ReviewForm record={record} draft={draft} onChange={setDraft} tab={tab} onTabChange={setTab} />
          <BalanceStrip
            declaredTotal={draft.total_area_sqm}
            parcelAreas={draft.parcels.map((p) => p.plot_area_sqm)}
            shares={draft.owners.map((o) => o.share_percentage)}
          />
        </section>
      </div>

      <SignModal
        open={signOpen}
        record={record}
        draft={draft}
        blocking={liveBlocking}
        role={role}
        reviewerId={reviewerId}
        submitting={verify.isPending}
        onClose={() => setSignOpen(false)}
        onConfirm={(reason, force) => verify.mutate({ reason, force })}
      />

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded px-4 py-2.5 text-sm shadow-lg"
          style={{
            background: toast.tone === "ok" ? "var(--verified)" : "var(--critical)",
            color: "#fff",
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function toDraft(record: KhataDetail): Draft {
  return {
    khata_number: record.khata_number,
    fasli_year: record.fasli_year ?? "",
    total_area_sqm: String(record.total_area_sqm),
    declared_unit: record.declared_unit ?? "",
    parcels: record.parcels.map((p) => ({
      parcel_id: p.parcel_id,
      khasra_number: p.khasra_number,
      plot_area_sqm: String(p.plot_area_sqm),
      land_classification: p.land_classification ?? "",
      ulpin: p.ulpin,
      bbox: p.bbox_json,
      confidence: p.field_confidence ?? {},
    })),
    owners: record.owners.map((o) => ({
      owner_id: o.owner_id,
      owner_name_vernacular: o.owner_name_vernacular,
      owner_name_en: o.owner_name_en ?? "",
      relation_type: o.relation_type ?? "",
      relative_name: o.relative_name ?? "",
      share_percentage: String(o.share_percentage),
      bbox: o.bbox_json,
      confidence: o.field_confidence ?? {},
    })),
  };
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-ink-muted">{children}</div>
  );
}

export const dynamic = "force-dynamic";
