"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, PenLine, ShieldCheck, X } from "lucide-react";
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
  onClose: () => void;
  onConfirm: (reason: string, forceApprove: boolean) => void;
}

interface DiffRow {
  field: string;
  before: string;
  after: string;
}

/**
 * Signing is the moment an extraction becomes an official record, so the dialog
 * shows exactly what will enter the ledger: every field the reviewer changed,
 * old value beside new. Nothing here is summarised — a diff a reviewer cannot
 * read is a signature they cannot stand behind.
 */
export default function SignModal({
  open,
  record,
  draft,
  blocking,
  role,
  reviewerId,
  submitting,
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const diff = useMemo<DiffRow[]>(() => {
    const rows: DiffRow[] = [];

    const compare = (field: string, before: unknown, after: unknown) => {
      const a = before === null || before === undefined ? "" : String(before);
      const b = after === null || after === undefined ? "" : String(after);
      if (a !== b) rows.push({ field, before: a || "empty", after: b || "empty" });
    };

    compare("Khata number", record.khata_number, draft.khata_number);
    compare("Fasli year", record.fasli_year, draft.fasli_year);
    if (Math.abs(toNumber(record.total_area_sqm) - toNumber(draft.total_area_sqm)) > 0.0001) {
      rows.push({
        field: "Total area",
        before: `${sqm(record.total_area_sqm)} m²`,
        after: `${sqm(draft.total_area_sqm)} m²`,
      });
    }

    draft.parcels.forEach((parcel, index) => {
      const original = record.parcels.find((p) => p.parcel_id === parcel.parcel_id);
      if (!original) {
        rows.push({
          field: `Parcel ${index + 1}`,
          before: "not on the record",
          after: `Khasra ${parcel.khasra_number || "?"}, ${sqm(parcel.plot_area_sqm)} m²`,
        });
        return;
      }
      compare(`Parcel ${index + 1} · Khasra`, original.khasra_number, parcel.khasra_number);
      if (Math.abs(toNumber(original.plot_area_sqm) - toNumber(parcel.plot_area_sqm)) > 0.0001) {
        rows.push({
          field: `Parcel ${index + 1} · area`,
          before: `${sqm(original.plot_area_sqm)} m²`,
          after: `${sqm(parcel.plot_area_sqm)} m²`,
        });
      }
      compare(
        `Parcel ${index + 1} · classification`,
        original.land_classification,
        parcel.land_classification,
      );
    });

    record.parcels
      .filter((p) => !draft.parcels.some((d) => d.parcel_id === p.parcel_id))
      .forEach((p) => rows.push({ field: "Parcel removed", before: `Khasra ${p.khasra_number}`, after: "removed" }));

    draft.owners.forEach((owner, index) => {
      const original = record.owners.find((o) => o.owner_id === owner.owner_id);
      if (!original) {
        rows.push({
          field: `Owner ${index + 1}`,
          before: "not on the record",
          after: `${owner.owner_name_vernacular || "?"} · ${owner.share_percentage}%`,
        });
        return;
      }
      compare(`Owner ${index + 1} · name`, original.owner_name_vernacular, owner.owner_name_vernacular);
      compare(`Owner ${index + 1} · relation`, original.relation_type ?? "", owner.relation_type);
      if (Math.abs(toNumber(original.share_percentage) - toNumber(owner.share_percentage)) > 0.001) {
        rows.push({
          field: `Owner ${index + 1} · share`,
          before: `${original.share_percentage}%`,
          after: `${owner.share_percentage}%`,
        });
      }
    });

    record.owners
      .filter((o) => !draft.owners.some((d) => d.owner_id === o.owner_id))
      .forEach((o) =>
        rows.push({ field: "Owner removed", before: o.owner_name_vernacular, after: "removed" }),
      );

    return rows;
  }, [record, draft]);

  if (!open) return null;

  const canOverride = role === "TEHSILDAR" && blocking.length > 0;
  const blocked = blocking.length > 0 && !(canOverride && override);
  const needsReason = canOverride && override && reason.trim().length < 8;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-2xl flex-col rounded bg-panel shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
          <div>
            <h2 id="sign-title" className="text-lg">
              Sign off Khata {draft.khata_number}
            </h2>
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
            className="rounded p-1 text-ink-muted hover:bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {blocking.length > 0 && (
            <div className="mb-4 rounded border border-critical bg-critical-wash p-3">
              <div className="mb-1.5 flex items-center gap-2 text-critical">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {blocking.length} check {blocking.length === 1 ? "still fails" : "still fail"}
                </span>
              </div>
              <ul className="space-y-1 text-sm">
                {blocking.map((finding) => (
                  <li key={finding.code + finding.field_path}>{finding.message}</li>
                ))}
              </ul>
              {canOverride ? (
                <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-critical/25 pt-3 text-sm">
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(event) => setOverride(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Commit anyway on my authority as Tehsildar. The open findings are written into
                    the audit ledger with my name against them.
                  </span>
                </label>
              ) : (
                <p className="mt-2 border-t border-critical/25 pt-2 text-xs">
                  Correct the values above, or ask a Tehsildar to commit the record on their
                  authority.
                </p>
              )}
            </div>
          )}

          <h3 className="mb-2 text-sm text-ink-muted">
            {diff.length === 0
              ? "No values were changed"
              : `${diff.length} ${diff.length === 1 ? "change" : "changes"} entering the ledger`}
          </h3>

          {diff.length === 0 ? (
            <p className="rounded border border-dashed border-rule-strong p-4 text-center text-sm text-ink-muted">
              You are confirming the extraction exactly as it was read.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-ink-muted">
                  <th className="py-1.5 pr-3 font-normal">Field</th>
                  <th className="py-1.5 pr-3 font-normal">Was read as</th>
                  <th className="py-1.5 font-normal">Corrected to</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((row, index) => (
                  <tr key={`${row.field}-${index}`} className="border-b border-rule/60 align-top">
                    <td className="py-1.5 pr-3 text-ink-muted">{row.field}</td>
                    <td className="py-1.5 pr-3">
                      <span className="font-id text-xs line-through opacity-70">{row.before}</span>
                    </td>
                    <td className="py-1.5">
                      <span className="font-id text-xs" style={{ color: "var(--verified)" }}>
                        {row.after}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <label className="mt-4 block">
            <span className="mb-1 block text-xs text-ink-muted">
              Note for the record {canOverride && override ? "(required for an override)" : "(optional)"}
            </span>
            <textarea
              className="field"
              rows={2}
              value={reason}
              placeholder="Why these values were changed"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-rule px-5 py-3.5">
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <ShieldCheck className="h-3.5 w-3.5" />
            Signed as <span className="font-id">{reviewerId}</span> · {role}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              Keep editing
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting || blocked || needsReason}
              onClick={() => onConfirm(reason.trim(), override)}
            >
              <PenLine className="h-4 w-4" />
              {submitting ? "Signing…" : override ? "Override and commit" : "Sign and commit"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
