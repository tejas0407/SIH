"use client";

import { Fingerprint, MapPinned, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { ApprovalStatus } from "@/lib/types";

interface Props {
  approvalStatus: ApprovalStatus;
  blockingCount: number;
  role: "PATWARI" | "TEHSILDAR";
  busy?: boolean;
  onReject: () => void;
  onFlag: () => void;
  onApprove: () => void;
}

/**
 * Statutory attestation strip at the foot of the review workspace: the legal
 * notice under which a revenue officer edits a record, then the three
 * institutional actions. e-Sign is the only path a record enters the register.
 */
export default function AttestationFooter({
  approvalStatus,
  blockingCount,
  role,
  busy,
  onReject,
  onFlag,
  onApprove,
}: Props) {
  const settled = approvalStatus === "MANUALLY_APPROVED" || approvalStatus === "REJECTED";
  const blocked = blockingCount > 0;
  const canOverride = role === "TEHSILDAR";
  const approveDisabled = busy || settled || (blocked && !canOverride);
  const { l, en } = useT();

  return (
    <div className="shrink-0 border-t border-rule bg-panel">
      <p className="border-b border-rule/60 px-4 py-1.5 text-2xs leading-relaxed text-ink-faint">
        <span className="font-medium text-ink-muted">
          <span className="font-vernacular">{l("notice")}</span> / {en("notice")}:
        </span>{" "}
        <span className="font-vernacular">{l("notice_body")}</span> Every modification is
        cryptographically hashed and permanently logged under Section 33 of the Land Revenue Code.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-danger h-9 text-xs"
            onClick={onReject}
            disabled={busy || settled}
          >
            <XCircle className="h-4 w-4" />
            <span className="font-vernacular">{l("reject_record")}</span>{" "}
            <span className="text-ink-faint">({en("reject_record")})</span>
          </button>
          <button
            type="button"
            className="btn btn-warn h-9 text-xs"
            onClick={onFlag}
            disabled={busy || settled}
          >
            <MapPinned className="h-4 w-4" />
            <span className="font-vernacular">{l("send_field")}</span>{" "}
            <span className="opacity-70">({en("send_field")})</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {blocked && (
            <span className="hidden text-2xs text-critical sm:inline">
              {canOverride
                ? `${blockingCount} invariant failing — e-Sign is a recorded override`
                : `${blockingCount} invariant failing — Tehsildar attestation required`}
            </span>
          )}
          <button
            type="button"
            onClick={onApprove}
            disabled={approveDisabled}
            className="inline-flex h-9 items-center gap-2 rounded border border-emerald-900 bg-emerald-800 px-4 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Fingerprint className="h-4 w-4" />
            {settled ? (
              <span>
                <span className="font-vernacular">
                  {l(approvalStatus === "REJECTED" ? "record_rejected" : "title_certified")}
                </span>{" "}
                / {en(approvalStatus === "REJECTED" ? "record_rejected" : "title_certified")}
              </span>
            ) : (
              <span>
                <span className="font-vernacular">{l("esign_approve")}</span>{" "}
                <span className="opacity-80">({en("esign_approve")})</span>
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
