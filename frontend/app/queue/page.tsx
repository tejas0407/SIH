"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Inbox } from "lucide-react";
import { fetchQueue } from "@/lib/api";
import { BAND_COLOR, band, pct, timestamp } from "@/lib/format";

type Sort = "confidence" | "oldest" | "newest";

const SORTS: { id: Sort; label: string }[] = [
  { id: "confidence", label: "Least confident first" },
  { id: "oldest", label: "Oldest first" },
  { id: "newest", label: "Newest first" },
];

export default function QueuePage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>("confidence");

  const { data, isLoading, error } = useQuery({
    queryKey: ["queue", page, sort],
    queryFn: () => fetchQueue(page, 20, sort),
    refetchInterval: 15_000,
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Records waiting for a reviewer</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Everything the system could not vouch for on its own. Open a record to compare it
            against the scan and sign it off.
          </p>
        </div>
        <label className="text-sm">
          <span className="mr-2 text-ink-muted">Order</span>
          <select
            className="field w-auto"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as Sort);
              setPage(1);
            }}
          >
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {isLoading && <Panel>Loading the queue…</Panel>}
      {error && <Panel tone="critical">{(error as Error).message}</Panel>}

      {data && data.items.length === 0 && (
        <div className="rounded border border-dashed border-rule-strong bg-panel px-6 py-14 text-center">
          <Inbox className="mx-auto mb-3 h-7 w-7 text-ink-muted" />
          <p className="text-base">The queue is empty.</p>
          <p className="mt-1 text-sm text-ink-muted">
            Every processed record either committed on its own or has already been signed off.
          </p>
          <Link href="/" className="btn mt-4 inline-flex">
            Upload a scan
          </Link>
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          <ul className="divide-y divide-rule overflow-hidden rounded border border-rule bg-panel">
            {data.items.map((item) => {
              const level = band(item.confidence_score);
              return (
                <li key={item.khata_id}>
                  <Link
                    href={`/review/${item.khata_id}`}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-panel-raised"
                  >
                    <span
                      className="h-9 w-1 shrink-0 rounded-sm"
                      style={{ background: BAND_COLOR[level] }}
                      aria-hidden
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-id text-base">Khata {item.khata_number}</span>
                        {item.critical_error_count > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-sm bg-critical-wash px-1.5 py-0.5 text-2xs text-critical">
                            <AlertTriangle className="h-3 w-3" />
                            {item.critical_error_count} failed{" "}
                            {item.critical_error_count === 1 ? "check" : "checks"}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm text-ink-muted">
                        {item.village
                          ? `${item.village.village_name}, ${item.village.tehsil}, ${item.village.district}`
                          : "Village not recorded"}
                        {" · "}
                        {item.parcel_count} {item.parcel_count === 1 ? "parcel" : "parcels"}
                        {" · "}
                        {timestamp(item.created_at)}
                      </p>
                      {item.top_error && (
                        <p className="mt-0.5 truncate text-xs" style={{ color: BAND_COLOR[level] }}>
                          {item.top_error}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="font-id text-base" style={{ color: BAND_COLOR[level] }}>
                        {pct(item.confidence_score, 0)}
                      </div>
                      <div className="text-2xs text-ink-muted">confidence</div>
                    </div>

                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>

          <nav className="mt-4 flex items-center justify-between text-sm">
            <span className="text-ink-muted">
              {(data.page - 1) * data.page_size + 1}–
              {Math.min(data.page * data.page_size, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button
                className="btn"
                disabled={data.page * data.page_size >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}
    </main>
  );
}

function Panel({ children, tone }: { children: React.ReactNode; tone?: "critical" }) {
  return (
    <div
      className="rounded border bg-panel px-4 py-6 text-center text-sm"
      style={{
        borderColor: tone === "critical" ? "var(--critical)" : "var(--rule)",
        color: tone === "critical" ? "var(--critical)" : "var(--ink-muted)",
      }}
    >
      {children}
    </div>
  );
}
