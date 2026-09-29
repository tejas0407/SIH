"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import type { ApprovalStatus } from "@/lib/types";

interface Props {
  khataId: string;
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
  khataId,
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
      {blocked && !settled && (
        <p className="px-5 pt-2.5 text-sm text-critical">
          {canOverride
            ? `${blockingCount} check failing — signing will be recorded as an override.`
            : `${blockingCount} check failing — a Tehsildar must sign this record.`}
        </p>
      )}
      <div className="flex items-stretch gap-2 px-5 py-3">
          <button
            type="button"
            className="btn btn-danger h-auto min-h-[3rem] flex-1 flex-col gap-0 py-1.5 text-sm leading-tight"
            onClick={onReject}
            disabled={busy || settled}
          >
            <span className="font-vernacular">{l("reject_record")}</span>
            <span className="text-xs opacity-80">{en("reject_record")}</span>
          </button>
          <button
            type="button"
            className="btn btn-warn h-auto min-h-[3rem] flex-1 flex-col gap-0 py-1.5 text-sm leading-tight"
            onClick={onFlag}
            disabled={busy || settled}
          >
            <span className="font-vernacular">{l("send_field")}</span>
            <span className="text-xs opacity-80">{en("send_field")}</span>
          </button>
          {approvalStatus === "MANUALLY_APPROVED" || approvalStatus === "AUTO_APPROVED" ? (
            <Link
              href={`/record/${khataId}`}
              className="inline-flex min-h-[3rem] flex-1 flex-col items-center justify-center gap-0 rounded border border-emerald-900 bg-emerald-800 px-3 py-1.5 text-sm font-semibold leading-tight text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              <span className="font-vernacular">{l("view_certified")}</span>
              <span className="text-xs font-normal opacity-90">{en("view_certified")}</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={onApprove}
              disabled={approveDisabled}
              className="inline-flex min-h-[3rem] flex-1 flex-col items-center justify-center gap-0 rounded border border-emerald-900 bg-emerald-800 px-3 py-1.5 text-sm font-semibold leading-tight text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {settled ? (
                <span>
                  <span className="font-vernacular">
                    {l(approvalStatus === "REJECTED" ? "record_rejected" : "title_certified")}
                  </span>{" "}
                  / {en(approvalStatus === "REJECTED" ? "record_rejected" : "title_certified")}
                </span>
              ) : (
                <>
                  <span className="font-vernacular">{l("esign_approve")}</span>
                  <span className="text-xs font-normal opacity-90">{en("esign_approve")}</span>
                </>
              )}
            </button>
          )}
      </div>
    </div>
  );
}
