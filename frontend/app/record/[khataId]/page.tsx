"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileSearch, Printer, ShieldAlert, ShieldCheck } from "lucide-react";
import EmblemPlaceholder from "@/components/gov/EmblemPlaceholder";
import { fetchKhata, fetchLedger } from "@/lib/api";
import { hectares, sqm, timestamp } from "@/lib/format";
import { STRINGS, useT, type StringKey } from "@/lib/i18n";

/**
 * Certified copy of a signed Record of Rights: the corrected values as they
 * now stand in the register, who signed them and when, and the state of the
 * tamper-evident edit history. Rendered as a page rather than a server-made
 * PDF so every Indian script shapes correctly; "Print / Save as PDF" uses the
 * browser's print dialog with a print stylesheet that drops the portal chrome.
 */
export default function CertifiedRecordPage() {
  const { khataId } = useParams<{ khataId: string }>();
  const { l, en, bi } = useT();

  const { data: record, isLoading, error } = useQuery({
    queryKey: ["khata", khataId],
    queryFn: () => fetchKhata(khataId),
  });
  const { data: ledger } = useQuery({
    queryKey: ["ledger", khataId],
    queryFn: () => fetchLedger(khataId),
  });

  if (isLoading || !record) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10 text-ink-muted">
        {error ? (error as Error).message : "Opening the record…"}
      </main>
    );
  }

  const signed =
    record.approval_status === "MANUALLY_APPROVED" || record.approval_status === "AUTO_APPROVED";
  const v = record.village;
  const totalShare = record.owners.reduce((t, o) => t + Number(o.share_percentage || 0), 0);

  const Bi = ({ k }: { k: StringKey }) => (
    <>
      <span className="font-vernacular">{l(k)}</span>
      <span className="text-ink-faint"> / </span>
      {en(k)}
    </>
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      {/* actions — not printed */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/queue?tab=signed" className="btn">
          <ArrowLeft className="h-4 w-4" />
          <Bi k="back_to_queue" />
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link href={`/review/${record.khata_id}`} className="btn">
            <FileSearch className="h-4 w-4" />
            <Bi k="view_scan" />
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            <Bi k="print_pdf" />
          </button>
        </div>
      </div>

      {!signed && (
        <p className="mb-6 rounded-md border border-review-border bg-review-wash px-4 py-3 text-base text-review">
          This record has not been signed yet, so this is not a certified copy.
        </p>
      )}

      <article className="rounded-lg border border-rule bg-panel px-8 py-8 print:rounded-none print:border-0 print:px-0">
        {/* letterhead */}
        <header className="flex items-center gap-4 border-b-2 border-ink pb-5">
          <EmblemPlaceholder className="h-14 w-14 shrink-0 text-ink" />
          <div className="leading-snug">
            <div className="text-sm font-semibold">
              <Bi k="gov_india" />
            </div>
            <div className="text-sm text-ink-muted">
              <Bi k="ministry" />
            </div>
            <h1 className="mt-1 text-xl font-bold">
              <Bi k="certified_copy" />
            </h1>
          </div>
        </header>

        {/* identity */}
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          <Item label={bi("khata_number")} value={record.khata_number} mono />
          <Item label={bi("fasli_year")} value={record.fasli_year || "—"} mono />
          <Item
            label={bi("total_area")}
            value={`${sqm(record.total_area_sqm)} m² (${hectares(record.total_area_sqm)} ha)`}
            mono
          />
          <Item label={bi("state")} value={v?.state ?? "—"} />
          <Item label={bi("district")} value={v?.district ?? "—"} />
          <Item label={bi("tehsil")} value={v?.tehsil ?? "—"} />
          <Item
            label={bi("village")}
            value={v ? `${v.village_name} (${v.village_code})` : "—"}
          />
        </dl>

        {/* parcels */}
        <h2 className="mt-8 text-lg font-semibold">
          <Bi k="parcel_ledger" />
        </h2>
        <table className="mt-3 w-full border-collapse text-base">
          <thead>
            <tr className="border-b-2 border-rule-strong text-left text-sm">
              <Th k="col_sno" />
              <Th k="col_khasra" />
              <Th k="col_area" />
              <Th k="col_class" />
              <Th k="col_ulpin" />
            </tr>
          </thead>
          <tbody>
            {record.parcels.map((p, i) => (
              <tr key={p.parcel_id} className="border-b border-rule align-top">
                <td className="py-2.5 pr-3">{i + 1}</td>
                <td className="py-2.5 pr-3 font-id">{p.khasra_number}</td>
                <td className="py-2.5 pr-3 font-id">
                  {hectares(p.plot_area_sqm)} ha
                  <span className="block text-sm text-ink-muted">{sqm(p.plot_area_sqm)} m²</span>
                </td>
                <td className="py-2.5 pr-3">{landClass(p.land_classification, bi)}</td>
                <td className="py-2.5 font-id text-sm">{p.ulpin || "—"}</td>
              </tr>
            ))}
            {record.parcels.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-ink-muted">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* owners */}
        <h2 className="mt-8 text-lg font-semibold">
          <Bi k="owners" />
        </h2>
        <table className="mt-3 w-full border-collapse text-base">
          <thead>
            <tr className="border-b-2 border-rule-strong text-left text-sm">
              <Th k="col_sno" />
              <Th k="owner_name" />
              <Th k="relation" />
              <Th k="share" />
            </tr>
          </thead>
          <tbody>
            {record.owners.map((o, i) => (
              <tr key={o.owner_id} className="border-b border-rule align-top">
                <td className="py-2.5 pr-3">{i + 1}</td>
                <td className="py-2.5 pr-3">
                  <span className="font-vernacular">{o.owner_name_vernacular}</span>
                  {o.owner_name_en && (
                    <span className="block text-sm text-ink-muted">{o.owner_name_en}</span>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  {o.relation_type ? `${o.relation_type} ${o.relative_name ?? ""}` : "—"}
                </td>
                <td className="py-2.5 font-id">
                  {Number(o.share_percentage).toFixed(2)} %
                  {o.share_fraction && (
                    <span className="block text-sm text-ink-muted">{o.share_fraction}</span>
                  )}
                </td>
              </tr>
            ))}
            {record.owners.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-ink-muted">
                  —
                </td>
              </tr>
            )}
            {record.owners.length > 0 && (
              <tr className="font-semibold">
                <td />
                <td colSpan={2} className="py-2.5 pr-3 text-right">
                  Σ
                </td>
                <td className="py-2.5 font-id">{totalShare.toFixed(2)} %</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* certification */}
        <section className="mt-10 grid gap-6 border-t-2 border-ink pt-6 sm:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            {record.approval_status === "AUTO_APPROVED" ? (
              <p className="text-base font-semibold text-verified">
                <Bi k="auto_committed" />
              </p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
                <Item label={bi("signed_by")} value={record.reviewed_by || "—"} />
                <Item
                  label={bi("signed_on")}
                  value={record.reviewed_at ? timestamp(record.reviewed_at) : "—"}
                />
              </dl>
            )}

            {ledger && (
              <p
                className={`flex items-start gap-2 text-sm ${
                  ledger.intact ? "text-verified" : "text-critical"
                }`}
              >
                {ledger.intact ? (
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>
                  <Bi k={ledger.intact ? "seal_intact" : "seal_broken"} />
                </span>
              </p>
            )}
          </div>

          {ledger?.head && (
            <div className="max-w-xs rounded-md border border-rule px-4 py-3">
              <div className="text-sm font-semibold">
                <Bi k="digital_seal" />
              </div>
              <p className="mt-1 break-all font-id text-xs text-ink-muted">{ledger.head}</p>
            </div>
          )}
        </section>

        <p className="mt-8 text-xs text-ink-faint">
          {STRINGS.lrm.en} (DILRMP) · Bhu-Validate · Khata ID {record.khata_id}
        </p>
      </article>
    </main>
  );
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={`mt-0.5 text-base font-medium ${mono ? "font-id" : ""}`}>{value}</dd>
    </div>
  );
}

function Th({ k }: { k: StringKey }) {
  const { l, en } = useT();
  return (
    <th className="py-2 pr-3 font-medium">
      <span className="block font-vernacular">{l(k)}</span>
      <span className="block text-xs font-normal text-ink-muted">{en(k)}</span>
    </th>
  );
}

const LAND_CLASS_KEYS: Record<string, StringKey> = {
  Agricultural: "lc_agricultural",
  Abadi: "lc_abadi",
  Irrigated: "lc_irrigated",
  Unirrigated: "lc_unirrigated",
  Orchard: "lc_orchard",
  "Dry crop": "lc_dry_crop",
  Barren: "lc_barren",
};

function landClass(value: string | null, bi: (k: StringKey) => string): string {
  if (!value) return "—";
  const key = LAND_CLASS_KEYS[value];
  return key ? bi(key) : value;
}
