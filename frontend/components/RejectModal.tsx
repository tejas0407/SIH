"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPinned, X, XCircle } from "lucide-react";
import GovFooter from "@/components/gov/GovFooter";

interface Props {
  open: boolean;
  mode: "reject" | "flag";
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

const COPY = {
  reject: {
    icon: XCircle,
    title: "Reject document",
    blurb:
      "Use this when the source page is too damaged to digitise — not when a value is merely mis-read. The scan returns to the tehsil record room with your reason on the audit ledger.",
    placeholder: "Why this page cannot be digitised (e.g. page 2 torn away, seal illegible)…",
    cta: "Reject & return",
  },
  flag: {
    icon: MapPinned,
    title: "Flag for field inspection",
    blurb:
      "Send the record to the field team for physical verification of boundaries or possession. The reason is recorded in the audit ledger and the record leaves the review queue.",
    placeholder: "What needs to be checked on the ground (e.g. Khasra 513/1 boundary disputed)…",
    cta: "Flag & dispatch",
  },
} as const;

export default function RejectModal({ open, mode, busy, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const copy = COPY[mode];
  const Icon = copy.icon;
  const tooShort = reason.trim().length < 8;

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && open && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.14 }}
            className="w-full max-w-md rounded-lg border border-rule bg-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Icon
                  className="h-4 w-4"
                  style={{ color: mode === "reject" ? "var(--critical)" : "var(--review)" }}
                />
                <h2 className="text-base">{copy.title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 text-ink-faint hover:bg-panel-raised hover:text-ink-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-3 px-5 py-4">
              <p className="text-xs leading-relaxed text-ink-muted">{copy.blurb}</p>
              <textarea
                className="field text-sm"
                rows={3}
                autoFocus
                value={reason}
                placeholder={copy.placeholder}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <footer className="flex justify-end gap-2 border-t border-rule px-5 py-3">
              <button type="button" className="btn h-9 text-xs" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn h-9 text-xs ${mode === "reject" ? "btn-danger" : "btn-warn"}`}
                disabled={busy || tooShort}
                onClick={() => onConfirm(reason.trim())}
              >
                {busy ? "Submitting…" : copy.cta}
              </button>
            </footer>
            <GovFooter compact />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
