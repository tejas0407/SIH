"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, ChevronRight, Inbox } from "lucide-react";
import { fetchQueue } from "@/lib/api";
import { BAND_COLOR, band, pct, timestamp } from "@/lib/format";
import { useT, type StringKey } from "@/lib/i18n";
import type { QueueItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type Sort = "confidence" | "oldest" | "newest";
type View = "pending" | "signed";

const SORTS: { id: Sort; label: StringKey }[] = [
  { id: "confidence", label: "sort_confidence" },
  { id: "oldest", label: "sort_oldest" },
  { id: "newest", label: "sort_newest" },
];

const VIEWS: { id: View; label: StringKey }[] = [
  { id: "pending", label: "tab_waiting" },
  { id: "signed", label: "tab_signed" },
];

export default function QueuePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-5xl px-6 py-8" />}>
      <Queue />
    </Suspense>
  );
}

function Queue() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view: View = params.get("tab") === "signed" ? "signed" : "pending";

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>("confidence");
  const { l, en } = useT();

  const { data, isLoading, error } = useQuery({
    queryKey: ["queue", view, page, sort],
    queryFn: () => fetchQueue(page, 20, sort, view),
    refetchInterval: 15_000,
  });

  const heading: StringKey = view === "signed" ? "tab_signed" : "queue_title";

  const switchView = (next: View) => {
    setPage(1);
    router.replace(next === "signed" ? `${pathname}?tab=signed` : pathname);
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-5">
        <h1 className="text-2xl">
          <span className="font-vernacular">{l(heading)}</span> / {en(heading)}
        </h1>
      </header>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-rule">
        <div role="tablist" className="flex gap-1">
          {VIEWS.map(({ id, label }) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchView(id)}
                className={`-mb-px border-b-2 px-4 py-2.5 text-base transition-colors ${
                  active
                    ? "border-focus font-semibold text-ink"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                <span className="font-vernacular">{l(label)}</span> / {en(label)}
              </button>
            );
          })}
        </div>

        {view === "pending" && (
          <label className="mb-2 text-sm">
            <span className="mr-2 text-ink-muted"><span className="font-vernacular">{l("order")}</span> / {en("order")}</span>
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
                  {l(option.label)} / {en(option.label)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {isLoading && <Panel>Loading…</Panel>}
      {error && <Panel tone="critical">{(error as Error).message}</Panel>}

      {data && data.items.length === 0 && (
        <div className="rounded border border-dashed border-rule-strong bg-panel px-6 py-14 text-center">
          <Inbox className="mx-auto mb-3 h-7 w-7 text-ink-muted" />
          {view === "pending" ? (
            <>
              <p className="text-base">
                <span className="font-vernacular">{l("queue_empty")}</span> / {en("queue_empty")}
              </p>
              <Link href="/" className="btn mt-4 inline-flex">
                <span className="font-vernacular">{l("upload_scan")}</span> / {en("upload_scan")}
              </Link>
            </>
          ) : (
            <p className="text-base">
              <span className="font-vernacular">{l("signed_empty")}</span> / {en("signed_empty")}
            </p>
          )}
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          <ul className="divide-y divide-rule overflow-hidden rounded border border-rule bg-panel">
            {data.items.map((item) =>
              view === "signed" ? (
                <SignedRow key={item.khata_id} item={item} />
              ) : (
                <PendingRow key={item.khata_id} item={item} />
              ),
            )}
          </ul>

          <nav className="mt-4 flex items-center justify-between text-sm">
            <span className="text-ink-muted">
              {(data.page - 1) * data.page_size + 1}–
              {Math.min(data.page * data.page_size, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <span className="font-vernacular">{l("previous")}</span> / {en("previous")}
              </button>
              <button
                className="btn"
                disabled={data.page * data.page_size >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                <span className="font-vernacular">{l("next")}</span> / {en("next")}
              </button>
            </div>
          </nav>
        </>
      )}
    </main>
  );
}

function place(item: QueueItem): string {
  return item.village
    ? `${item.village.village_name}, ${item.village.tehsil}, ${item.village.district}`
    : "Village not recorded";
}

function PendingRow({ item }: { item: QueueItem }) {
  const level = band(item.confidence_score);
  return (
    <li>
      <Link
        href={`/review/${item.khata_id}`}
        className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-panel-raised"
      >
        <span
          className="h-10 w-1 shrink-0 rounded-sm"
          style={{ background: BAND_COLOR[level] }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-id text-lg">Khata {item.khata_number}</span>
            {item.critical_error_count > 0 && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-critical-wash px-2 py-0.5 text-sm text-critical">
                <AlertTriangle className="h-3.5 w-3.5" />
                {item.critical_error_count} failed{" "}
                {item.critical_error_count === 1 ? "check" : "checks"}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-ink-muted">
            {place(item)} · {item.parcel_count} {item.parcel_count === 1 ? "parcel" : "parcels"} ·{" "}
            {timestamp(item.created_at)}
          </p>
          {item.top_error && (
            <p className="mt-0.5 truncate text-sm" style={{ color: BAND_COLOR[level] }}>
              {item.top_error}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-id text-lg" style={{ color: BAND_COLOR[level] }}>
            {pct(item.confidence_score, 0)}
          </div>
          <div className="text-xs text-ink-muted">
            <ConfidenceLabel />
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-muted" />
      </Link>
    </li>
  );
}

function SignedRow({ item }: { item: QueueItem }) {
  const { l, en } = useT();
  const auto = item.approval_status === "AUTO_APPROVED";
  return (
    <li>
      <Link
        href={`/record/${item.khata_id}`}
        className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-panel-raised"
      >
        <BadgeCheck className="h-7 w-7 shrink-0 text-verified" aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="font-id text-lg">Khata {item.khata_number}</span>
          <p className="truncate text-sm text-ink-muted">
            {place(item)} · {item.parcel_count} {item.parcel_count === 1 ? "parcel" : "parcels"}
          </p>
          <p className="mt-0.5 text-sm text-verified">
            {auto ? (
              <>
                <span className="font-vernacular">{l("auto_committed")}</span> /{" "}
                {en("auto_committed")}
              </>
            ) : (
              <>
                <span className="font-vernacular">{l("signed_by")}</span> / {en("signed_by")}:{" "}
                {item.reviewed_by_name ?? item.reviewed_by ?? "—"}
                {item.reviewed_at && ` · ${timestamp(item.reviewed_at)}`}
              </>
            )}
          </p>
        </div>
        <span className="hidden shrink-0 text-sm text-focus sm:inline">
          <span className="font-vernacular">{l("view_certified")}</span> / {en("view_certified")}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-muted" />
      </Link>
    </li>
  );
}

function Panel({ children, tone }: { children: React.ReactNode; tone?: "critical" }) {
  return (
    <div
      className="rounded border bg-panel px-4 py-6 text-center text-base"
      style={{
        borderColor: tone === "critical" ? "var(--critical)" : "var(--rule)",
        color: tone === "critical" ? "var(--critical)" : "var(--ink-muted)",
      }}
    >
      {children}
    </div>
  );
}

function ConfidenceLabel() {
  const { l, en } = useT();
  return (
    <>
      <span className="font-vernacular">{l("confidence")}</span> / {en("confidence")}
    </>
  );
}
