"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Fingerprint, Lock, PenLine, ShieldCheck, X } from "lucide-react";
import { sqm, toNumber } from "@/lib/format";
import type { Draft } from "./ReviewForm";
import type { KhataDetail, ValidationFinding } from "@/lib/types";

interface Props {
  open: boolean;
  record: KhataDetail;
  draft: Draft;
  blocking: ValidationFinding[];
  role: "PATWARI" | "TEHSILDAR";
  reviewerId: string;
  submitting: boolean;
  /** Set once the server has committed — switches the modal to the seal screen. */
  sealHash: string | null;
  onClose: () => void;
  onConfirm: (reason: string, forceApprove: boolean) => void;
}

interface DiffRow {
  field: string;
  before: string;
  after: string;
}

/**
 * Signing is the moment an extraction becomes an official record. The dialog
 * shows exactly what will enter the ledger — every changed field, old value
 * beside new, with the officer against it — then simulates the e-Sign step:
 * a SHA-256 stamp is generated and shown before the record is committed.
 */
export default function SignModal({
  open,
  record,
  draft,
  blocking,
  role,
  reviewerId,
  submitting,
  sealHash,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("");
      setOverride(false);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && open && !sealHash && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, sealHash]);

  const diff = useMemo<DiffRow[]>(() => buildDiff(record, draft), [record, draft]);

  if (!open) return null;

  const canOverride = role === "TEHSILDAR" && blocking.length > 0;
  const blocked = blocking.length > 0 && !(canOverride && override);
  const needsReason = canOverride && override && reason.trim().length < 8;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-6"
        role="dialog"
        aria-modal="true"
        onClick={() => !sealHash && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-lg border border-rule bg-panel shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {sealHash ? (
            <SealScreen hash={sealHash} khata={draft.khata_number} />
          ) : (
            <>
              <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
                <div>
                  <h2 className="text-lg">Sign off Khata {draft.khata_number}</h2>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {record.village
                      ? `${record.village.village_name}, ${record.village.tehsil}, ${record.village.district}`
                      : "Village not recorded"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close without signing"
                  className="rounded p-1 text-ink-faint hover:bg-panel-raised hover:text-ink-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {blocking.length > 0 && (
                  <div
                    className="mb-4 rounded-md border p-3"
                    style={{
                      borderColor: "var(--critical-border)",
                      background: "var(--critical-wash)",
                    }}
                  >
                    <div className="mb-1.5 flex items-center gap-2 text-critical">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm font-semibold">
                        {blocking.length} invariant {blocking.length === 1 ? "still fails" : "still fail"}
                      </span>
                    </div>
                    <ul className="space-y-1 text-sm text-ink">
                      {blocking.map((f) => (
                        <li key={f.code + f.field_path}>{f.message}</li>
                      ))}
                    </ul>
                    {canOverride ? (
                      <label className="mt-3 flex cursor-pointer items-start gap-2 border-t pt-3 text-sm"
                        style={{ borderColor: "var(--critical-border)" }}>
                        <input
                          type="checkbox"
                          checked={override}
                          onChange={(e) => setOverride(e.target.checked)}
                          className="mt-0.5 accent-[var(--critical)]"
                        />
                        <span>
                          Commit on my authority as Tehsildar. The open findings are written into the
                          audit ledger with my name against them.
                        </span>
                      </label>
                    ) : (
                      <p className="mt-2 border-t pt-2 text-xs" style={{ borderColor: "var(--critical-border)" }}>
                        Correct the values, or ask a Tehsildar to commit on their authority.
                      </p>
                    )}
                  </div>
                )}

                <h3 className="mb-2 text-xs uppercase tracking-wide text-ink-faint">
                  {diff.length === 0
                    ? "No values were changed"
                    : `${diff.length} ${diff.length === 1 ? "change" : "changes"} entering the ledger`}
                </h3>

                {diff.length === 0 ? (
                  <p className="rounded-md border border-dashed border-rule-strong p-4 text-center text-sm text-ink-faint">
                    You are confirming the extraction exactly as it was read.
                  </p>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-rule text-left text-[11px] text-ink-faint">
                        <th className="py-1.5 pr-3 font-normal">Field</th>
                        <th className="py-1.5 pr-3 font-normal">OCR value</th>
                        <th className="py-1.5 pr-3 font-normal">Corrected to</th>
                        <th className="py-1.5 font-normal">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.map((row, i) => (
                        <tr key={`${row.field}-${i}`} className="border-b border-rule/60 align-top">
                          <td className="py-1.5 pr-3 text-ink-muted">{row.field}</td>
                          <td className="py-1.5 pr-3">
                            <span className="font-id text-xs text-ink-faint line-through">
                              {row.before}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3">
                            <span className="font-id text-xs" style={{ color: "var(--verified)" }}>
                              {row.after}
                            </span>
                          </td>
                          <td className="py-1.5 text-[11px] text-ink-faint">
                            {reviewerId}
                            <br />
                            {role}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <label className="mt-4 block">
                  <span className="mb-1 block text-[11px] text-ink-faint">
                    Note for the record{" "}
                    {canOverride && override ? "(required for an override)" : "(optional)"}
                  </span>
                  <textarea
                    className="field text-sm"
                    rows={2}
                    value={reason}
                    placeholder="Why these values were changed"
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              </div>

              <footer className="flex items-center justify-between gap-4 border-t border-rule px-5 py-3.5">
                <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Signing as <span className="font-id text-ink-muted">{reviewerId}</span> · {role}
                </p>
                <div className="flex gap-2">
                  <button type="button" className="btn h-9 text-xs" onClick={onClose} disabled={submitting}>
                    Keep editing
                  </button>
                  <button
                    type="button"
                    className="btn btn-approve h-9 text-xs"
                    disabled={submitting || blocked || needsReason}
                    onClick={() => onConfirm(reason.trim(), override)}
                  >
                    {submitting ? (
                      <>
                        <Fingerprint className="h-4 w-4 animate-pulse" />
                        Generating seal…
                      </>
                    ) : (
                      <>
                        <PenLine className="h-4 w-4" />
                        {override ? "Override & commit" : "Sign & commit"}
                      </>
                    )}
                  </button>
                </div>
              </footer>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function SealScreen({ hash, khata }: { hash: string; khata: string }) {
  return (
    <div className="flex flex-col items-center gap-4 px-8 py-12 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        className="grid h-16 w-16 place-items-center rounded-full"
        style={{ background: "var(--verified-wash)", border: "1px solid var(--verified-border)" }}
      >
        <Lock className="h-7 w-7 text-verified" />
      </motion.div>

      <div>
        <h2 className="text-lg">Digital seal applied</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Khata {khata} is committed to the land register and the correction chain is closed.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="w-full rounded-md border border-rule bg-panel-raised p-3"
      >
        <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
          <Fingerprint className="h-3 w-3" />
          SHA-256 ledger head
        </div>
        <p className="break-all font-id text-xs text-verified">{hash}</p>
      </motion.div>

      <p className="text-[11px] text-ink-faint">Returning to the review queue…</p>
    </div>
  );
}

function buildDiff(record: KhataDetail, draft: Draft): DiffRow[] {
  const rows: DiffRow[] = [];
  const cmp = (field: string, before: unknown, after: unknown) => {
    const a = before === null || before === undefined ? "" : String(before);
    const b = after === null || after === undefined ? "" : String(after);
    if (a !== b) rows.push({ field, before: a || "empty", after: b || "empty" });
  };

  cmp("Khata number", record.khata_number, draft.khata_number);
  cmp("Fasli year", record.fasli_year, draft.fasli_year);
  if (Math.abs(toNumber(record.total_area_sqm) - toNumber(draft.total_area_sqm)) > 0.0001) {
    rows.push({
      field: "Total area",
      before: `${sqm(record.total_area_sqm)} m²`,
      after: `${sqm(draft.total_area_sqm)} m²`,
    });
  }

  draft.parcels.forEach((p, i) => {
    const orig = record.parcels.find((x) => x.parcel_id === p.parcel_id);
    if (!orig) {
      rows.push({
        field: `Parcel ${i + 1}`,
        before: "not on the record",
        after: `Khasra ${p.khasra_number || "?"}, ${sqm(p.plot_area_sqm)} m²`,
      });
      return;
    }
    cmp(`Parcel ${i + 1} · Khasra`, orig.khasra_number, p.khasra_number);
    if (Math.abs(toNumber(orig.plot_area_sqm) - toNumber(p.plot_area_sqm)) > 0.0001) {
      rows.push({
        field: `Parcel ${i + 1} · area`,
        before: `${sqm(orig.plot_area_sqm)} m²`,
        after: `${sqm(p.plot_area_sqm)} m²`,
      });
    }
    cmp(`Parcel ${i + 1} · class`, orig.land_classification, p.land_classification);
  });

  record.parcels
    .filter((p) => !draft.parcels.some((d) => d.parcel_id === p.parcel_id))
    .forEach((p) =>
      rows.push({ field: "Parcel removed", before: `Khasra ${p.khasra_number}`, after: "removed" }),
    );

  draft.owners.forEach((o, i) => {
    const orig = record.owners.find((x) => x.owner_id === o.owner_id);
    if (!orig) {
      rows.push({
        field: `Owner ${i + 1}`,
        before: "not on the record",
        after: `${o.owner_name_vernacular || "?"} · ${o.share_percentage}%`,
      });
      return;
    }
    cmp(`Owner ${i + 1} · name`, orig.owner_name_vernacular, o.owner_name_vernacular);
    cmp(`Owner ${i + 1} · relation`, orig.relation_type ?? "", o.relation_type);
    if (Math.abs(toNumber(orig.share_percentage) - toNumber(o.share_percentage)) > 0.001) {
      rows.push({
        field: `Owner ${i + 1} · share`,
        before: `${orig.share_percentage}%`,
        after: `${o.share_percentage}%`,
      });
    }
  });

  record.owners
    .filter((o) => !draft.owners.some((d) => d.owner_id === o.owner_id))
    .forEach((o) =>
      rows.push({ field: "Owner removed", before: o.owner_name_vernacular, after: "removed" }),
    );

  return rows;
}
