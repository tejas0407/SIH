"use client";

import { Plus, Trash2 } from "lucide-react";
import { BAND_LABEL, band, pct } from "@/lib/format";
import { useReviewStore } from "@/lib/store";
import type { BBox, KhataDetail, RelationType, ValidationFinding } from "@/lib/types";

export interface ParcelDraft {
  parcel_id: string | null;
  khasra_number: string;
  plot_area_sqm: string;
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

export type Tab = "khata" | "parcels" | "owners" | "history";

interface Props {
  record: KhataDetail;
  draft: Draft;
  onChange: (draft: Draft) => void;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "khata", label: "Khata" },
  { id: "parcels", label: "Parcels" },
  { id: "owners", label: "Owners" },
  { id: "history", label: "History" },
];

export default function ReviewForm({ record, draft, onChange, tab, onTabChange }: Props) {
  const findingsFor = (path: string) =>
    record.validation_errors.filter((f) => f.field_path.startsWith(path));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="flex shrink-0 border-b border-rule bg-panel">
        {TABS.map(({ id, label }) => {
          const count =
            id === "parcels"
              ? draft.parcels.length
              : id === "owners"
                ? draft.owners.length
                : id === "history"
                  ? record.audit_trail.length
                  : 0;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTabChange(id)}
              className={`relative px-4 py-2.5 text-sm transition-colors ${
                tab === id ? "text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {label}
              {count > 0 && <span className="ml-1.5 text-2xs text-ink-muted tabular">{count}</span>}
              {tab === id && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" />}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "khata" && (
          <KhataTab record={record} draft={draft} onChange={onChange} findingsFor={findingsFor} />
        )}
        {tab === "parcels" && <ParcelsTab draft={draft} onChange={onChange} record={record} />}
        {tab === "owners" && <OwnersTab draft={draft} onChange={onChange} />}
        {tab === "history" && <HistoryTab record={record} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Khata */
function KhataTab({
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
  const village = record.village;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Khata number"
          fieldKey="khata.khata_number"
          bbox={null}
          confidence={record.confidence.ocr_confidence}
          value={draft.khata_number}
          onValue={(v) => onChange({ ...draft, khata_number: v })}
          mono
        />
        <Field
          label="Fasli year"
          fieldKey="khata.fasli_year"
          bbox={null}
          value={draft.fasli_year}
          onValue={(v) => onChange({ ...draft, fasli_year: v })}
          mono
        />
        <Field
          label="Total area recorded (m²)"
          fieldKey="khata.total_area_sqm"
          bbox={null}
          confidence={record.confidence.ocr_confidence}
          value={draft.total_area_sqm}
          onValue={(v) => onChange({ ...draft, total_area_sqm: v })}
          mono
          hint={findingsFor("khata.total_area_sqm")[0]?.message}
        />
        <Field
          label="Unit as printed"
          fieldKey="khata.declared_unit"
          bbox={null}
          value={draft.declared_unit}
          onValue={(v) => onChange({ ...draft, declared_unit: v })}
        />
      </div>

      {village && (
        <dl className="rounded border border-rule bg-panel p-3 text-sm">
          <Row label="Village" value={`${village.village_name} (${village.village_code})`} />
          <Row label="Tehsil" value={village.tehsil} />
          <Row label="District" value={`${village.district}, ${village.state}`} />
        </dl>
      )}

      <div className="rounded border border-rule bg-panel p-3">
        <div className="mb-2 text-sm text-ink-muted">How the confidence score was reached</div>
        <ConfidenceBar label="Text read from the scan" weight={0.5} value={record.confidence.ocr_confidence} />
        <ConfidenceBar label="Page structure found" weight={0.3} value={record.confidence.layout_confidence} />
        <ConfidenceBar label="Arithmetic checks passed" weight={0.2} value={record.confidence.math_checks_pass} />
        <div className="mt-2 flex items-baseline justify-between border-t border-rule pt-2">
          <span className="text-sm">Combined</span>
          <span className="font-id text-lg">{pct(record.confidence.total_confidence)}</span>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          Records at or above {pct(record.confidence.threshold, 0)} with no failed rule commit
          without a reviewer.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function ConfidenceBar({ label, weight, value }: { label: string; weight: number; value: number }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-ink-muted">
          {label} <span className="tabular">×{weight}</span>
        </span>
        <span className="font-id">{pct(value)}</span>
      </div>
      <div className="h-1.5 rounded-sm bg-surface">
        <div
          className="h-full rounded-sm"
          style={{ width: `${Math.max(value * 100, 1)}%`, background: "var(--ink-muted)" }}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Parcels */
function ParcelsTab({
  draft,
  onChange,
  record,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  record: KhataDetail;
}) {
  const update = (index: number, patch: Partial<ParcelDraft>) => {
    const parcels = draft.parcels.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange({ ...draft, parcels });
  };

  const add = () =>
    onChange({
      ...draft,
      parcels: [
        ...draft.parcels,
        {
          parcel_id: null,
          khasra_number: "",
          plot_area_sqm: "0",
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
      {draft.parcels.length === 0 && (
        <Empty message="No parcels were read from this page. Add the first Khasra entry to start." />
      )}

      {draft.parcels.map((parcel, index) => (
        <div key={parcel.parcel_id ?? `new-${index}`} className="rounded border border-rule bg-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-ink-muted">Row {index + 1}</span>
            <button
              type="button"
              onClick={() => remove(index)}
              title="Remove this parcel"
              className="rounded p-1 text-ink-muted transition-colors hover:bg-critical-wash hover:text-critical"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Khasra number"
              fieldKey={`parcels.${index}.khasra_number`}
              bbox={parcel.bbox}
              confidence={parcel.confidence.khasra_number}
              value={parcel.khasra_number}
              onValue={(v) => update(index, { khasra_number: v })}
              mono
            />
            <Field
              label="Plot area (m²)"
              fieldKey={`parcels.${index}.plot_area_sqm`}
              bbox={parcel.bbox}
              confidence={parcel.confidence.plot_area_sqm}
              value={parcel.plot_area_sqm}
              onValue={(v) => update(index, { plot_area_sqm: v })}
              mono
            />
            <Field
              label="Land classification"
              fieldKey={`parcels.${index}.land_classification`}
              bbox={parcel.bbox}
              value={parcel.land_classification}
              onValue={(v) => update(index, { land_classification: v })}
            />
            <div>
              <div className="mb-1 text-xs text-ink-muted">Bhu-Aadhaar (ULPIN)</div>
              <div className="field font-id text-xs text-ink-muted">
                {parcel.ulpin ?? "Assigned once the parcel is surveyed"}
              </div>
            </div>
          </div>
        </div>
      ))}

      <button type="button" onClick={add} className="btn w-full justify-center">
        <Plus className="h-4 w-4" />
        Add a parcel
      </button>

      {record.parcels.length > 0 && (
        <p className="text-xs text-ink-muted">
          Focus any field to bring its position on the scan into view.
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Owners */
function OwnersTab({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const update = (index: number, patch: Partial<OwnerDraft>) => {
    const owners = draft.owners.map((o, i) => (i === index ? { ...o, ...patch } : o));
    onChange({ ...draft, owners });
  };

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
    const count = draft.owners.length;
    if (!count) return;
    const each = Math.floor((10000 / count)) / 100;
    const owners = draft.owners.map((owner, index) => ({
      ...owner,
      // The remainder goes to the first owner so the shares close at exactly
      // 100% rather than 99.99% — which the validator would reject.
      share_percentage: (index === 0 ? +(100 - each * (count - 1)).toFixed(2) : each).toFixed(2),
    }));
    onChange({ ...draft, owners });
  };

  return (
    <div className="space-y-3">
      {draft.owners.length === 0 && (
        <Empty message="No owners were read from this page. A Khata cannot be committed without at least one." />
      )}

      {draft.owners.map((owner, index) => (
        <div key={owner.owner_id ?? `new-${index}`} className="rounded border border-rule bg-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-ink-muted">Owner {index + 1}</span>
            <button
              type="button"
              onClick={() => onChange({ ...draft, owners: draft.owners.filter((_, i) => i !== index) })}
              title="Remove this owner"
              className="rounded p-1 text-ink-muted transition-colors hover:bg-critical-wash hover:text-critical"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Name as written"
              fieldKey={`owners.${index}.owner_name_vernacular`}
              bbox={owner.bbox}
              confidence={owner.confidence.owner_name_vernacular}
              value={owner.owner_name_vernacular}
              onValue={(v) => update(index, { owner_name_vernacular: v })}
              vernacular
            />
            <Field
              label="Name in English"
              fieldKey={`owners.${index}.owner_name_en`}
              bbox={owner.bbox}
              value={owner.owner_name_en}
              onValue={(v) => update(index, { owner_name_en: v })}
            />
            <div>
              <label className="mb-1 block text-xs text-ink-muted">Relation</label>
              <select
                className="field"
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
              onValue={(v) => update(index, { relative_name: v })}
              vernacular
            />
            <Field
              label="Share (%)"
              fieldKey={`owners.${index}.share_percentage`}
              bbox={owner.bbox}
              confidence={owner.confidence.share_percentage}
              value={owner.share_percentage}
              onValue={(v) => update(index, { share_percentage: v })}
              mono
            />
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <button type="button" onClick={add} className="btn flex-1 justify-center">
          <Plus className="h-4 w-4" />
          Add an owner
        </button>
        <button
          type="button"
          onClick={splitEvenly}
          disabled={draft.owners.length === 0}
          className="btn"
          title="Set every share to an equal fraction of the holding"
        >
          Split shares evenly
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- History */
function HistoryTab({ record }: { record: KhataDetail }) {
  if (record.audit_trail.length === 0) {
    return <Empty message="Nothing has been changed on this record yet." />;
  }

  return (
    <ol className="space-y-2">
      {record.audit_trail.map((entry) => (
        <li key={entry.log_id} className="rounded border border-rule bg-panel p-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-id text-xs">{entry.field_name}</span>
            <span className="text-2xs text-ink-muted">
              {entry.modified_by_user_id} · {entry.role}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
            <span className="rounded-sm bg-critical-wash px-1.5 py-0.5 font-id text-xs line-through">
              {entry.raw_extracted_value ?? "empty"}
            </span>
            <span className="rounded-sm bg-verified-wash px-1.5 py-0.5 font-id text-xs">
              {entry.corrected_value ?? "removed"}
            </span>
          </div>
          {entry.reason && <p className="mt-1.5 text-xs text-ink-muted">{entry.reason}</p>}
          <p className="mt-1 font-id text-2xs text-ink-muted">
            {new Date(entry.timestamp).toLocaleString("en-IN")} · {entry.entry_hash.slice(0, 16)}…
          </p>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ Field */
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
}) {
  const focusField = useReviewStore((s) => s.focusField);
  const hoverField = useReviewStore((s) => s.hoverField);
  const level = confidence === undefined ? undefined : band(confidence);

  const focus = () => {
    if (bbox) focusField({ key: fieldKey, bbox, confidence, label });
  };

  return (
    <div>
      <label className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-ink-muted">{label}</span>
        {confidence !== undefined && (
          <span className="tabular" style={{ color: `var(--${level === "high" ? "verified" : level === "medium" ? "review" : "critical"})` }}>
            {pct(confidence, 0)}
          </span>
        )}
      </label>
      <input
        className={`field ${mono ? "font-id" : ""} ${vernacular ? "font-vernacular" : ""}`}
        data-confidence={level}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        onFocus={focus}
        onMouseEnter={() => hoverField(fieldKey)}
        onMouseLeave={() => hoverField(null)}
        title={level ? BAND_LABEL[level] : undefined}
      />
      {hint && <p className="mt-1 text-xs text-critical">{hint}</p>}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="rounded border border-dashed border-rule-strong p-6 text-center text-sm text-ink-muted">
      {message}
    </div>
  );
}
