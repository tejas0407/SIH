"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crosshair, FileText, History, Plus, ScrollText, Trash2 } from "lucide-react";
import StampBadge, { type StampKind } from "@/components/gov/StampBadge";
import { AREA_TOLERANCE, BAND_COLOR, BAND_LABEL, band, hectares, pct, toNumber } from "@/lib/format";
import { useReviewStore } from "@/lib/store";
import type { BBox, KhataDetail, RelationType, ValidationFinding } from "@/lib/types";

export interface ParcelDraft {
  parcel_id: string | null;
  khasra_number: string;
  plot_area_sqm: string;
  declared_area: string;
  declared_unit: string;
  land_classification: string;
  ulpin: string | null;
  bbox: BBox | null;
  confidence: Record<string, number>;
}

export interface OwnerDraft {
  owner_id: string | null;
  owner_name_vernacular: string;
  owner_name_en: string;
  relation_type: RelationType | "";
  relative_name: string;
  share_percentage: string;
  bbox: BBox | null;
  confidence: Record<string, number>;
}

export interface Draft {
  khata_number: string;
  fasli_year: string;
  total_area_sqm: string;
  declared_unit: string;
  parcels: ParcelDraft[];
  owners: OwnerDraft[];
}

export type Tab = "metadata" | "parcels" | "owners" | "notes";

interface Props {
  record: KhataDetail;
  draft: Draft;
  onChange: (draft: Draft) => void;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "metadata", label: "Metadata", icon: FileText },
  { id: "parcels", label: "Parcels", icon: ScrollText },
  { id: "owners", label: "Ownership", icon: History },
  { id: "notes", label: "Marginal notes", icon: ScrollText },
];

export default function ReviewForm({ record, draft, onChange, tab, onTabChange }: Props) {
  const findingsFor = (path: string) =>
    record.validation_errors.filter((f) => f.field_path.startsWith(path));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="flex shrink-0 border-b border-rule bg-panel">
        {TABS.map(({ id, label, icon: Icon }) => {
          const count =
            id === "parcels"
              ? draft.parcels.length
              : id === "owners"
                ? draft.owners.length
                : id === "notes"
                  ? record.audit_trail.length
                  : 0;
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(id)}
              className={`relative flex items-center gap-1.5 px-3.5 py-2.5 text-xs transition-colors ${
                active ? "text-ink" : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {count > 0 && (
                <span className="rounded-sm bg-panel-raised px-1 py-px font-id text-[10px] text-ink-muted">
                  {count}
                </span>
              )}
              {active && (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-ink"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
            className="p-4"
          >
            {tab === "metadata" && (
              <MetadataTab record={record} draft={draft} onChange={onChange} findingsFor={findingsFor} />
            )}
            {tab === "parcels" && <ParcelsTab draft={draft} onChange={onChange} record={record} />}
            {tab === "owners" && <OwnersTab draft={draft} onChange={onChange} />}
            {tab === "notes" && <NotesTab record={record} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Metadata */
function MetadataTab({
  record,
  draft,
  onChange,
  findingsFor,
}: {
  record: KhataDetail;
  draft: Draft;
  onChange: (d: Draft) => void;
  findingsFor: (p: string) => ValidationFinding[];
}) {
  const v = record.village;

  return (
    <div className="space-y-4">
      <Section title="Location">
        <div className="grid grid-cols-2 gap-3">
          <ReadOnly label="State" value={v?.state ?? "—"} />
          <ReadOnly label="District" value={v?.district ?? "—"} />
          <ReadOnly label="Tehsil" value={v?.tehsil ?? "—"} />
          <ReadOnly label="Village code" value={v?.village_code ?? "—"} mono />
        </div>
      </Section>

      <Section title="Record identity">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Khata number"
            fieldKey="khata.khata_number"
            bbox={null}
            confidence={record.confidence.ocr_confidence}
            value={draft.khata_number}
            onValue={(x) => onChange({ ...draft, khata_number: x })}
            mono
          />
          <Field
            label="Fasli year"
            fieldKey="khata.fasli_year"
            bbox={null}
            value={draft.fasli_year}
            onValue={(x) => onChange({ ...draft, fasli_year: x })}
            mono
          />
          <Field
            label="Total area recorded (m²)"
            fieldKey="khata.total_area_sqm"
            bbox={null}
            confidence={record.confidence.ocr_confidence}
            value={draft.total_area_sqm}
            onValue={(x) => onChange({ ...draft, total_area_sqm: x })}
            mono
            hint={findingsFor("khata.total_area_sqm")[0]?.message}
          />
          <Field
            label="Unit as printed"
            fieldKey="khata.declared_unit"
            bbox={null}
            value={draft.declared_unit}
            onValue={(x) => onChange({ ...draft, declared_unit: x })}
          />
        </div>
      </Section>

      <Section title="How the composite score was reached">
        <ConfidenceBar label="Text read from the scan" weight={0.5} value={record.confidence.ocr_confidence} />
        <ConfidenceBar label="Page structure found" weight={0.3} value={record.confidence.layout_confidence} />
        <ConfidenceBar
          label="Arithmetic checks passed"
          weight={0.2}
          value={record.confidence.math_checks_pass}
        />
        <div className="mt-2 flex items-baseline justify-between border-t border-rule pt-2">
          <span className="text-sm">C_total</span>
          <span className="font-id text-lg">{pct(record.confidence.total_confidence)}</span>
        </div>
        <p className="mt-1 text-[11px] text-ink-faint">
          Records at or above {pct(record.confidence.threshold, 0)} with no failed invariant commit
          without a reviewer.
        </p>
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------- Parcels */
const ROR_COLS = [
  { hi: "क्र.सं.", en: "S.No." },
  { hi: "खसरा संख्या", en: "Khasra / Survey No." },
  { hi: "क्षेत्रफल (हे. / वर्ग मी.)", en: "Area in Ha / Sq.m" },
  { hi: "भू-उपयोग", en: "Land Classification" },
  { hi: "विशिष्ट पहचान", en: "ULPIN / Bhu-Aadhaar" },
  { hi: "सत्यापन स्थिति", en: "Status" },
];

function ParcelsTab({
  draft,
  onChange,
  record,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  record: KhataDetail;
}) {
  const highlight = useReviewStore((s) => s.highlightIssues);
  const focusField = useReviewStore((s) => s.focusField);

  const parcelSum = draft.parcels.reduce((t, p) => t + toNumber(p.plot_area_sqm), 0);
  const declared = toNumber(draft.total_area_sqm);
  const areaMismatch = Math.abs(parcelSum - declared) > AREA_TOLERANCE;
  const settled =
    record.approval_status === "MANUALLY_APPROVED" || record.approval_status === "AUTO_APPROVED";
  const rowStamp: StampKind = areaMismatch ? "discrepancy" : settled ? "sealed" : "pending";

  const update = (index: number, patch: Partial<ParcelDraft>) =>
    onChange({
      ...draft,
      parcels: draft.parcels.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    });

  const add = () =>
    onChange({
      ...draft,
      parcels: [
        ...draft.parcels,
        {
          parcel_id: null,
          khasra_number: "",
          plot_area_sqm: "0",
          declared_area: "",
          declared_unit: draft.declared_unit,
          land_classification: "",
          ulpin: null,
          bbox: null,
          confidence: {},
        },
      ],
    });

  const remove = (index: number) =>
    onChange({ ...draft, parcels: draft.parcels.filter((_, i) => i !== index) });

  return (
    <div className="space-y-3">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-[10px] uppercase tracking-wide text-ink-faint">
          खसरा विवरण / Record of Rights — Parcel ledger
        </h3>
        <span className="font-id text-2xs text-ink-faint">
          Σ {parcelSum.toFixed(2)} m² ({hectares(parcelSum)} ha)
        </span>
      </div>

      {draft.parcels.length === 0 && (
        <Empty message="No parcels were read from this page. Add the first Khasra entry to start." />
      )}

      {draft.parcels.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-rule">
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-rule bg-panel-raised text-left align-bottom">
                {ROR_COLS.map((c) => (
                  <th key={c.en} className="px-2 py-1.5 font-medium">
                    <span className="block font-vernacular text-[11px] text-ink-muted">{c.hi}</span>
                    <span className="block text-[10px] font-normal text-ink-faint">{c.en}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.parcels.map((parcel, index) => {
                const level = band(minConf(parcel.confidence));
                return (
                  <tr
                    key={parcel.parcel_id ?? `new-${index}`}
                    className="border-b border-rule/60 align-top last:border-0"
                    style={{
                      background: highlight ? "var(--critical-wash)" : "transparent",
                    }}
                  >
                    {/* 1 · S.No + row actions */}
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <span className="font-id text-ink-muted">{index + 1}</span>
                      </div>
                      <div className="mt-1 flex gap-0.5">
                        <button
                          type="button"
                          title="Locate on scan"
                          disabled={!parcel.bbox}
                          onClick={() =>
                            parcel.bbox &&
                            focusField({
                              key: `parcels.${index}.khasra_number`,
                              bbox: parcel.bbox,
                              confidence: minConf(parcel.confidence),
                              label: `Khasra ${parcel.khasra_number}`,
                            })
                          }
                          className="rounded-sm border border-rule p-0.5 text-ink-muted hover:border-focus hover:text-focus disabled:opacity-40"
                        >
                          <Crosshair className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          title="Remove parcel"
                          onClick={() => remove(index)}
                          className="rounded-sm p-0.5 text-ink-faint hover:bg-critical-wash hover:text-critical"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>

                    {/* 2 · Khasra number */}
                    <td className="px-2 py-1.5">
                      <CellInput
                        value={parcel.khasra_number}
                        onValue={(x) => update(index, { khasra_number: x })}
                        mono
                        onFocus={() =>
                          parcel.bbox &&
                          focusField({
                            key: `parcels.${index}.khasra_number`,
                            bbox: parcel.bbox,
                            confidence: parcel.confidence.khasra_number,
                            label: `Khasra ${parcel.khasra_number}`,
                          })
                        }
                      />
                      <span
                        className="mt-0.5 block text-[9px]"
                        style={{ color: BAND_COLOR[level] }}
                      >
                        {pct(minConf(parcel.confidence), 0)} conf.
                      </span>
                    </td>

                    {/* 3 · Area */}
                    <td className="px-2 py-1.5">
                      <CellInput
                        value={parcel.plot_area_sqm}
                        onValue={(x) => update(index, { plot_area_sqm: x })}
                        mono
                        suffix="m²"
                      />
                      <span className="mt-0.5 block font-id text-[9px] text-ink-faint">
                        ≈ {hectares(parcel.plot_area_sqm)} ha
                      </span>
                    </td>

                    {/* 4 · Land classification */}
                    <td className="px-2 py-1.5">
                      <select
                        className="w-full rounded-sm border border-rule bg-panel-raised px-1 py-1 text-[11px]"
                        value={parcel.land_classification}
                        onChange={(e) => update(index, { land_classification: e.target.value })}
                      >
                        <option value="">—</option>
                        {LAND_CLASSES.map((c) => (
                          <option key={c.en} value={c.en}>
                            {c.hi} / {c.en}
                          </option>
                        ))}
                        {parcel.land_classification &&
                          !LAND_CLASSES.some((c) => c.en === parcel.land_classification) && (
                            <option value={parcel.land_classification}>
                              {parcel.land_classification}
                            </option>
                          )}
                      </select>
                    </td>

                    {/* 5 · ULPIN */}
                    <td className="px-2 py-1.5">
                      <span className="font-id text-[10px] text-ink-muted">
                        {parcel.ulpin ?? "—"}
                      </span>
                      {!parcel.ulpin && (
                        <span className="block text-[9px] text-ink-faint">on survey</span>
                      )}
                    </td>

                    {/* 6 · Status */}
                    <td className="px-2 py-1.5">
                      <StampBadge kind={rowStamp} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" onClick={add} className="btn h-9 w-full text-xs">
        <Plus className="h-4 w-4" />
        नया खसरा जोड़ें / Add a parcel
      </button>

      {record.parcels.length > 0 && (
        <p className="text-[11px] text-ink-faint">
          Focusing a cell, or the <span className="text-ink-muted">crosshair</span>, brings the
          parcel&rsquo;s position on the scan into view.
        </p>
      )}
    </div>
  );
}

function CellInput({
  value,
  onValue,
  mono,
  suffix,
  onFocus,
}: {
  value: string;
  onValue: (v: string) => void;
  mono?: boolean;
  suffix?: string;
  onFocus?: () => void;
}) {
  return (
    <div className="relative">
      <input
        className={`w-full rounded-sm border border-rule bg-panel-raised px-1.5 py-1 text-[11px] focus:border-focus focus:outline-none ${
          mono ? "font-id" : ""
        } ${suffix ? "pr-7" : ""}`}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        onFocus={onFocus}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 font-id text-[9px] text-ink-faint">
          {suffix}
        </span>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Owners */
function OwnersTab({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const highlight = useReviewStore((s) => s.highlightIssues);
  const focusField = useReviewStore((s) => s.focusField);

  const update = (index: number, patch: Partial<OwnerDraft>) =>
    onChange({
      ...draft,
      owners: draft.owners.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    });

  const add = () =>
    onChange({
      ...draft,
      owners: [
        ...draft.owners,
        {
          owner_id: null,
          owner_name_vernacular: "",
          owner_name_en: "",
          relation_type: "",
          relative_name: "",
          share_percentage: "0",
          bbox: null,
          confidence: {},
        },
      ],
    });

  const splitEvenly = () => {
    const n = draft.owners.length;
    if (!n) return;
    const each = Math.floor(10000 / n) / 100;
    onChange({
      ...draft,
      owners: draft.owners.map((o, i) => ({
        ...o,
        share_percentage: (i === 0 ? +(100 - each * (n - 1)).toFixed(2) : each).toFixed(2),
      })),
    });
  };

  return (
    <div className="space-y-3">
      {draft.owners.length === 0 && (
        <Empty message="No owners were read from this page. A Khata cannot be committed without at least one." />
      )}

      {draft.owners.map((owner, index) => (
        <div
          key={owner.owner_id ?? `new-${index}`}
          className="rounded-md border bg-panel-raised p-3"
          style={{
            borderColor: highlight ? "var(--critical-border)" : "var(--rule)",
            boxShadow: highlight ? "0 0 0 3px var(--critical-wash)" : "none",
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] text-ink-faint">Co-owner {index + 1}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Centre this owner on the scan"
                disabled={!owner.bbox}
                onClick={() =>
                  owner.bbox &&
                  focusField({
                    key: `owners.${index}.owner_name_vernacular`,
                    bbox: owner.bbox,
                    confidence: minConf(owner.confidence),
                    label: owner.owner_name_en || owner.owner_name_vernacular,
                  })
                }
                className="inline-flex items-center gap-1 rounded-sm border border-rule px-1.5 py-1 text-[10px] text-ink-muted hover:border-focus hover:text-focus disabled:opacity-40"
              >
                <Crosshair className="h-3 w-3" />
                Locate
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({ ...draft, owners: draft.owners.filter((_, i) => i !== index) })
                }
                title="Remove owner"
                className="rounded p-1 text-ink-faint hover:bg-critical-wash hover:text-critical"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Name as written"
              fieldKey={`owners.${index}.owner_name_vernacular`}
              bbox={owner.bbox}
              confidence={owner.confidence.owner_name_vernacular}
              value={owner.owner_name_vernacular}
              onValue={(x) => update(index, { owner_name_vernacular: x })}
              vernacular
            />
            <Field
              label="Name in English"
              fieldKey={`owners.${index}.owner_name_en`}
              bbox={owner.bbox}
              value={owner.owner_name_en}
              onValue={(x) => update(index, { owner_name_en: x })}
            />
            <div>
              <label className="mb-1 block text-[11px] text-ink-faint">Relation</label>
              <select
                className="field text-sm"
                value={owner.relation_type}
                onChange={(e) => update(index, { relation_type: e.target.value as RelationType })}
              >
                <option value="">Not recorded</option>
                <option value="S/o">S/o</option>
                <option value="D/o">D/o</option>
                <option value="W/o">W/o</option>
                <option value="C/o">C/o</option>
              </select>
            </div>
            <Field
              label="Relative's name"
              fieldKey={`owners.${index}.relative_name`}
              bbox={owner.bbox}
              value={owner.relative_name}
              onValue={(x) => update(index, { relative_name: x })}
              vernacular
            />
            <Field
              label="Share (%)"
              fieldKey={`owners.${index}.share_percentage`}
              bbox={owner.bbox}
              confidence={owner.confidence.share_percentage}
              value={owner.share_percentage}
              onValue={(x) => update(index, { share_percentage: x })}
              mono
            />
            <div>
              <label className="mb-1 block text-[11px] text-ink-faint">Aadhaar (hashed on save)</label>
              <input
                className="field font-id text-sm"
                inputMode="numeric"
                placeholder="•••• •••• ••••"
                defaultValue=""
                disabled
                title="Aadhaar is never stored raw — a salted SHA-256 digest is written on verify"
              />
            </div>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <button type="button" onClick={add} className="btn h-9 flex-1 text-xs">
          <Plus className="h-4 w-4" />
          Add a co-owner
        </button>
        <button
          type="button"
          onClick={splitEvenly}
          disabled={draft.owners.length === 0}
          className="btn h-9 text-xs"
          title="Set every share to an equal fraction of the holding"
        >
          Split evenly
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Notes */
function NotesTab({ record }: { record: KhataDetail }) {
  return (
    <div className="space-y-5">
      <Section title="Patwari marginal remarks">
        <div className="rounded-md border border-dashed border-rule-strong p-5 text-center">
          <ScrollText className="mx-auto mb-2 h-6 w-6 text-ink-faint" />
          <p className="text-sm text-ink-muted">No marginal remarks were transcribed for this record.</p>
          <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-ink-faint">
            When the Patwari&rsquo;s margin column carries a handwritten mutation note, the TrOCR
            handwriting engine transcribes it here with a confidence badge and a cropped image of the
            original strokes, side by side, for verification.
          </p>
        </div>
      </Section>

      <Section title={`Correction history · ${record.audit_trail.length}`}>
        {record.audit_trail.length === 0 ? (
          <Empty message="Nothing has been changed on this record yet. Every field you edit will be written to the hash-chained ledger on verify." />
        ) : (
          <ol className="space-y-2">
            {record.audit_trail.map((entry) => (
              <li
                key={entry.log_id}
                className="rounded-md border border-rule bg-panel-raised p-3 text-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-id text-xs text-ink-muted">{entry.field_name}</span>
                  <span className="text-[10px] text-ink-faint">
                    {entry.modified_by_user_id} · {entry.role}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                  <span
                    className="rounded-sm px-1.5 py-0.5 font-id text-xs line-through"
                    style={{ background: "var(--critical-wash)", color: "var(--critical)" }}
                  >
                    {entry.raw_extracted_value ?? "empty"}
                  </span>
                  <span
                    className="rounded-sm px-1.5 py-0.5 font-id text-xs"
                    style={{ background: "var(--verified-wash)", color: "var(--verified)" }}
                  >
                    {entry.corrected_value ?? "removed"}
                  </span>
                </div>
                {entry.reason && (
                  <p className="mt-1.5 text-[11px] text-ink-faint">{entry.reason}</p>
                )}
                <p className="mt-1 font-id text-[10px] text-ink-faint">
                  {new Date(entry.timestamp).toLocaleString("en-IN")} ·{" "}
                  {entry.entry_hash.slice(0, 16)}…
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ shared */
const LAND_CLASSES: { hi: string; en: string }[] = [
  { hi: "कृषि", en: "Agricultural" },
  { hi: "गैर-कृषि / आबादी", en: "Abadi" },
  { hi: "सिंचित", en: "Irrigated" },
  { hi: "असिंचित", en: "Unirrigated" },
  { hi: "बाग", en: "Orchard" },
  { hi: "शुष्क फसल", en: "Dry crop" },
  { hi: "बंजर", en: "Barren" },
];

function minConf(map: Record<string, number>): number {
  const values = Object.values(map ?? {});
  return values.length ? Math.min(...values) : 1;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-rule bg-panel p-3">
      <h3 className="mb-2.5 text-[10px] uppercase tracking-wide text-ink-faint">{title}</h3>
      {children}
    </section>
  );
}

function ReadOnly({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-ink-faint">{label}</div>
      <div className={`rounded border border-rule bg-panel-raised px-2.5 py-1.5 text-sm ${mono ? "font-id" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function ConfidenceBar({ label, weight, value }: { label: string; weight: number; value: number }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-[11px]">
        <span className="text-ink-faint">
          {label} <span className="tabular">×{weight}</span>
        </span>
        <span className="font-id text-ink-muted">{pct(value)}</span>
      </div>
      <div className="h-1.5 rounded-sm bg-panel-raised">
        <div
          className="h-full rounded-sm"
          style={{ width: `${Math.max(value * 100, 1)}%`, background: BAND_COLOR[band(value)] }}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  fieldKey,
  bbox,
  value,
  onValue,
  confidence,
  mono,
  vernacular,
  hint,
  suffix,
}: {
  label: string;
  fieldKey: string;
  bbox: BBox | null;
  value: string;
  onValue: (v: string) => void;
  confidence?: number;
  mono?: boolean;
  vernacular?: boolean;
  hint?: string;
  suffix?: string;
}) {
  const focusField = useReviewStore((s) => s.focusField);
  const hoverField = useReviewStore((s) => s.hoverField);
  const level = confidence === undefined ? undefined : band(confidence);

  return (
    <div>
      <label className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-ink-faint">{label}</span>
        {confidence !== undefined && (
          <span className="tabular" style={{ color: BAND_COLOR[level!] }}>
            {pct(confidence, 0)}
          </span>
        )}
      </label>
      <div className="relative">
        <input
          className={`field text-sm ${mono ? "font-id" : ""} ${vernacular ? "font-vernacular" : ""} ${
            suffix ? "pr-14" : ""
          }`}
          data-confidence={level}
          value={value}
          onChange={(e) => onValue(e.target.value)}
          onFocus={() =>
            bbox && focusField({ key: fieldKey, bbox, confidence, label })
          }
          onMouseEnter={() => hoverField(fieldKey)}
          onMouseLeave={() => hoverField(null)}
          title={level ? BAND_LABEL[level] : undefined}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-id text-[11px] text-ink-faint">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-[11px] text-critical">{hint}</p>}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-rule-strong p-5 text-center text-xs text-ink-faint">
      {message}
    </div>
  );
}
