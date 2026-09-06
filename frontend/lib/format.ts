import type { ValidationFinding } from "./types";

export type ConfidenceBand = "high" | "medium" | "low";

/** The three bands the brief defines: >=85 green, 50-84 amber, <50 red. */
export function band(confidence: number | undefined): ConfidenceBand {
  if (confidence === undefined || confidence === null) return "medium";
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

export const BAND_COLOR: Record<ConfidenceBand, string> = {
  high: "var(--verified)",
  medium: "var(--review)",
  low: "var(--critical)",
};

export const BAND_LABEL: Record<ConfidenceBand, string> = {
  high: "Read cleanly",
  medium: "Needs a look",
  low: "Could not read",
};

export function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** Areas are compared digit by digit against a printed page, so they are shown
 *  in full square metres with hectares as a secondary read. */
export function sqm(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function hectares(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return (n / 10000).toLocaleString("en-IN", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : 0;
}

export function timestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function severityColor(severity: ValidationFinding["severity"]): string {
  if (severity === "CRITICAL") return "var(--critical)";
  if (severity === "WARNING") return "var(--review)";
  return "var(--ink-muted)";
}

/** Findings a reviewer must clear before the record can be signed. */
export function criticalFindings(findings: ValidationFinding[]): ValidationFinding[] {
  return findings.filter((f) => f.severity === "CRITICAL");
}

/** Tolerances match the backend: 0.005 sqm on area, 0.01% on shares. */
export const AREA_TOLERANCE = 0.005;
export const SHARE_TOLERANCE = 0.01;
