"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useDropzone } from "react-dropzone";
import { useQuery } from "@tanstack/react-query";
import { Download, FileUp, Loader2 } from "lucide-react";
import { exportUrl, fetchDocumentStatus, fetchSummary, uploadScan } from "@/lib/api";
import { pct } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { ProcessingStatus } from "@/lib/types";

interface Job {
  documentId: string;
  filename: string;
  status: ProcessingStatus;
  step: string | null;
  progress: number;
  khataId?: string;
  error?: string;
}

const STEP_LABEL: Record<ProcessingStatus, string> = {
  QUEUED: "Waiting for a worker",
  PREPROCESSING: "Straightening and cleaning the page",
  EXTRACTING: "Reading the text",
  VALIDATING: "Checking the arithmetic",
  NEEDS_REVIEW: "Needs a reviewer",
  COMMITTED: "Committed to the register",
  FAILED: "Could not be processed",
};

export default function HomePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const { l, en, bi } = useT();

  const { data: summary } = useQuery({
    queryKey: ["summary"],
    queryFn: fetchSummary,
    refetchInterval: 10_000,
  });

  const track = useCallback((documentId: string, filename: string) => {
    setJobs((current) => [
      { documentId, filename, status: "QUEUED", step: null, progress: 0 },
      ...current.filter((j) => j.documentId !== documentId),
    ]);

    // Poll until the pipeline reaches a terminal state. Polling rather than a
    // socket keeps the stack to the five containers the brief asks for.
    const poll = setInterval(async () => {
      try {
        const status = await fetchDocumentStatus(documentId);
        setJobs((current) =>
          current.map((job) =>
            job.documentId === documentId
              ? {
                  ...job,
                  status: status.processing_status,
                  step: status.current_step,
                  progress: status.progress_pct,
                  khataId: status.khata_ids[0],
                  error: status.error_message ?? undefined,
                }
              : job,
          ),
        );
        if (["COMMITTED", "NEEDS_REVIEW", "FAILED"].includes(status.processing_status)) {
          clearInterval(poll);
        }
      } catch {
        clearInterval(poll);
      }
    }, 1500);
  }, []);

  const onDrop = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        try {
          const response = await uploadScan(file);
          track(response.document_id, file.name);
        } catch (error) {
          setJobs((current) => [
            {
              documentId: `failed-${file.name}-${Date.now()}`,
              filename: file.name,
              status: "FAILED",
              step: null,
              progress: 0,
              error: (error as Error).message,
            },
            ...current,
          ]);
        }
      }
    },
    [track],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/tiff": [".tif", ".tiff"],
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl">
          <span className="font-vernacular">{l("land_record_digitisation")}</span> / {en("land_record_digitisation")}
        </h1>
        <p className="mt-2 max-w-2xl text-base text-ink-muted">
          Upload a scanned Jamabandi, 7/12 extract or Khatauni. The system reads it, checks the
          totals, and sends it to you only if something needs a person to look.
        </p>
      </header>

      <div
        {...getRootProps()}
        className={`cursor-pointer rounded border-2 border-dashed px-6 py-12 text-center transition-colors ${
          isDragActive ? "border-focus bg-focus-wash" : "border-rule-strong bg-panel hover:border-ink-muted"
        }`}
      >
        <input {...getInputProps()} />
        <FileUp className="mx-auto mb-3 h-7 w-7 text-ink-muted" />
        <p className="text-base">
          {isDragActive ? "Drop the scans here" : "Drop scans here, or click to choose files"}
        </p>
        <p className="mt-1 text-xs text-ink-muted">PDF, JPEG, PNG or TIFF · up to 60 MB each</p>
      </div>

      {jobs.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm text-ink-muted">Processing</h2>
          <ul className="divide-y divide-rule overflow-hidden rounded border border-rule bg-panel">
            {jobs.map((job) => (
              <li key={job.documentId} className="px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{job.filename}</p>
                    <p className="text-xs text-ink-muted">
                      {job.error ?? job.step ?? STEP_LABEL[job.status]}
                    </p>
                  </div>

                  {job.status === "COMMITTED" && (
                    <span className="shrink-0 text-sm" style={{ color: "var(--verified)" }}>
                      Committed
                    </span>
                  )}
                  {job.status === "NEEDS_REVIEW" && job.khataId && (
                    <Link href={`/review/${job.khataId}`} className="btn shrink-0">
                      Review now
                    </Link>
                  )}
                  {job.status === "FAILED" && (
                    <span className="shrink-0 text-sm" style={{ color: "var(--critical)" }}>
                      Failed
                    </span>
                  )}
                  {!["COMMITTED", "NEEDS_REVIEW", "FAILED"].includes(job.status) && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-muted" />
                  )}
                </div>

                {!["COMMITTED", "NEEDS_REVIEW", "FAILED"].includes(job.status) && (
                  <div className="mt-2 h-1 rounded-sm bg-panel-raised">
                    <div
                      className="h-full rounded-sm bg-focus transition-all"
                      style={{ width: `${Math.max(job.progress, 4)}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary && (
        <section className="mt-10">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-rule bg-rule sm:grid-cols-4">
            <Stat label={bi("records_held")} value={String(summary.khata_total)} />
            <Stat label={bi("awaiting_review")} value={String(summary.pending_review)} />
            <Stat label={bi("committed_auto")} value={pct(summary.auto_commit_rate, 0)} />
            <Stat label={bi("area_on_register")} value={`${summary.approved_area_hectares} ha`} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/queue" className="btn">
              <span className="font-vernacular">{l("open_review_queue")}</span> / {en("open_review_queue")}
            </Link>
            <a className="btn" href={exportUrl("geojson")}>
              <Download className="h-4 w-4" />
              <span className="font-vernacular">{l("export")}</span> / {en("export")} GeoJSON
            </a>
            <a className="btn" href={exportUrl("csv")}>
              <Download className="h-4 w-4" />
              <span className="font-vernacular">{l("export")}</span> / {en("export")} CSV
            </a>
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel px-4 py-3">
      <div className="font-id text-xl">{value}</div>
      <div className="mt-0.5 text-xs text-ink-muted">{label}</div>
    </div>
  );
}
