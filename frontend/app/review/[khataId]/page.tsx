"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import AttestationFooter from "@/components/AttestationFooter";
import DiscrepancyDrawer from "@/components/DiscrepancyDrawer";
import DocumentViewer from "@/components/DocumentViewer";
import MetricsBar from "@/components/MetricsBar";
import ReviewForm, { type Draft, type Tab } from "@/components/ReviewForm";
import GovBreadcrumb from "@/components/gov/GovBreadcrumb";
import RejectModal from "@/components/RejectModal";
import SignModal from "@/components/SignModal";
import { fetchKhata, rejectKhata, verifyKhata } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AREA_TOLERANCE, SHARE_TOLERANCE, toNumber } from "@/lib/format";
import { useReviewStore, type FocusTarget } from "@/lib/store";
import type { KhataDetail, ValidationFinding } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function ReviewPage() {
  const { khataId } = useParams<{ khataId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const user = useAuth((s) => s.user);
  const reviewerId = user?.login_id ?? "unknown";
  const role: "PATWARI" | "TEHSILDAR" = user?.role === "TEHSILDAR" ? "TEHSILDAR" : "PATWARI";

  const setHighlightIssues = useReviewStore((s) => s.setHighlightIssues);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<Tab>("metadata");
  const [signOpen, setSignOpen] = useState(false);
  const [sealHash, setSealHash] = useState<string | null>(null);
  const [rejectState, setRejectState] = useState<{ open: boolean; mode: "reject" | "flag" }>({
    open: false,
    mode: "reject",
  });
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  const { data: record, isLoading, error } = useQuery({
    queryKey: ["khata", khataId],
    queryFn: () => fetchKhata(khataId),
  });

  useEffect(() => {
    if (record && !draft) setDraft(toDraft(record));
  }, [record, draft]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

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
          declared_unit: p.declared_unit || null,
          declared_area: p.declared_area || null,
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
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["khata", khataId] });

      if (response.committed) {
        setSealHash(response.ledger_head);
        confetti({ particleCount: 70, spread: 62, origin: { y: 0.7 }, disableForReducedMotion: true });
        setTimeout(() => {
          setSignOpen(false);
          router.push("/queue");
        }, 2400);
      } else {
        setSignOpen(false);
        setToast({ text: response.message, tone: "warn" });
      }
    },
    onError: (err: Error) => setToast({ text: err.message, tone: "warn" }),
  });

  const reject = useMutation({
    mutationFn: ({ reason }: { reason: string }) => rejectKhata(khataId, reason),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      setRejectState((s) => ({ ...s, open: false }));
      setToast({ text: response.message, tone: "warn" });
      setTimeout(() => router.push("/queue"), 1400);
    },
    onError: (err: Error) => setToast({ text: err.message, tone: "warn" }),
  });

  const boxes = useMemo<FocusTarget[]>(() => {
    if (!record) return [];
    const targets: FocusTarget[] = [];
    record.parcels.forEach((parcel, index) => {
      if (parcel.bbox_json) {
        targets.push({
          key: `parcels.${index}.khasra_number`,
          bbox: parcel.bbox_json,
          confidence: minConf(parcel.field_confidence),
          label: `Khasra ${parcel.khasra_number}`,
        });
      }
    });
    record.owners.forEach((owner, index) => {
      if (owner.bbox_json) {
        targets.push({
          key: `owners.${index}.owner_name_vernacular`,
          bbox: owner.bbox_json,
          confidence: minConf(owner.field_confidence),
          label: owner.owner_name_en ?? owner.owner_name_vernacular,
        });
      }
    });
    return targets;
  }, [record]);

  /** Client-side mirror of the backend invariants, so the action bar reflects
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

  const handleHighlight = () => {
    setTab("parcels");
    setHighlightIssues(true);
    setTimeout(() => setHighlightIssues(false), 6000);
  };

  if (isLoading || !draft || !record) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-sm text-ink-muted">
        {error ? (error as Error).message : "Opening the record…"}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface text-ink">
      <GovBreadcrumb record={record} blocking={liveBlocking} />

      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-[56]">
          <DocumentViewer
            pageUrls={
              record.page_urls?.length
                ? record.page_urls
                : record.document_url
                  ? [record.document_url]
                  : []
            }
            boxes={boxes}
          />
        </section>

        <section className="flex min-w-0 flex-[44] flex-col border-l border-rule bg-surface">
          <MetricsBar draft={draft} />
          <DiscrepancyDrawer findings={liveBlocking} draft={draft} onHighlight={handleHighlight} />
          <ReviewForm record={record} draft={draft} onChange={setDraft} tab={tab} onTabChange={setTab} />
          <AttestationFooter
            approvalStatus={record.approval_status}
            blockingCount={liveBlocking.length}
            role={role}
            busy={verify.isPending || reject.isPending}
            onReject={() => setRejectState({ open: true, mode: "reject" })}
            onFlag={() => setRejectState({ open: true, mode: "flag" })}
            onApprove={() => setSignOpen(true)}
          />
        </section>
      </div>

      {signOpen && (
        <SignModal
          open={signOpen}
          record={record}
          draft={draft}
          blocking={liveBlocking}
          role={role}
          reviewerId={reviewerId}
          submitting={verify.isPending}
          sealHash={sealHash}
          onClose={() => {
            setSignOpen(false);
            setSealHash(null);
          }}
          onConfirm={(reason, force) => verify.mutate({ reason, force })}
        />
      )}

      <RejectModal
        open={rejectState.open}
        mode={rejectState.mode}
        busy={reject.isPending}
        onClose={() => setRejectState((s) => ({ ...s, open: false }))}
        onConfirm={(reason) =>
          reject.mutate({
            reason:
              rejectState.mode === "flag"
                ? `Flagged for field inspection — ${reason}`
                : reason,
          })
        }
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="status"
            className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2.5 text-sm shadow-xl"
            style={{
              background: toast.tone === "ok" ? "var(--verified)" : "var(--critical)",
              color: "#ffffff",
            }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function minConf(map: Record<string, number> | undefined): number {
  const values = Object.values(map ?? {});
  return values.length ? Math.min(...values) : 1;
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
      declared_area: p.declared_area != null ? String(p.declared_area) : "",
      declared_unit: p.declared_unit ?? record.declared_unit ?? "",
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
