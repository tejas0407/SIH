"use client";

import { Lock, MapPinned, ShieldAlert, XCircle } from "lucide-react";
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

export default function ActionBar({
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

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-rule bg-panel px-4 py-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-danger h-9 text-xs"
          onClick={onReject}
          disabled={busy || settled}
        >
          <XCircle className="h-4 w-4" />
          Reject document
        </button>
        <button
          type="button"
          className="btn btn-warn h-9 text-xs"
          onClick={onFlag}
          disabled={busy || settled}
        >
          <MapPinned className="h-4 w-4" />
          Flag for field inspection
        </button>
      </div>

      <div className="flex items-center gap-3">
        {blocked && (
          <span className="hidden items-center gap-1.5 text-[11px] text-critical sm:flex">
            <ShieldAlert className="h-3.5 w-3.5" />
            {canOverride
              ? `${blockingCount} check failing — commit is a recorded override`
              : `${blockingCount} check failing — a Tehsildar must commit this`}
          </span>
        )}
        <button
          type="button"
          className="btn btn-approve h-9 text-xs"
          onClick={onApprove}
          disabled={approveDisabled}
        >
          <Lock className="h-4 w-4" />
          {settled
            ? approvalStatus === "REJECTED"
              ? "Rejected"
              : "Sealed"
            : blocked && canOverride
              ? "Override & apply digital seal"
              : "Approve & apply digital seal"}
        </button>
      </div>
    </div>
  );
}
