/** Mirrors backend/app/schemas/records.py. The OpenAPI schema at
 *  http://localhost:8000/openapi.json is the reference if these drift. */

export type ProcessingStatus =
  | "QUEUED"
  | "PREPROCESSING"
  | "EXTRACTING"
  | "VALIDATING"
  | "NEEDS_REVIEW"
  | "COMMITTED"
  | "FAILED";

export type ApprovalStatus =
  | "PENDING"
  | "AUTO_APPROVED"
  | "MANUALLY_APPROVED"
  | "REJECTED";

export type Severity = "CRITICAL" | "WARNING" | "INFO";
export type ActorRole = "PATWARI" | "TEHSILDAR" | "SYSTEM";

export interface AuthUser {
  user_id: string;
  login_id: string;
  display_name: string;
  role: ActorRole;
  last_login_at: string | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}
export type RelationType = "S/o" | "D/o" | "W/o" | "C/o";

export interface BBox {
  page: number;
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface Village {
  village_code: string;
  village_name: string;
  tehsil: string;
  district: string;
  state: string;
}

export interface Parcel {
  parcel_id: string;
  khasra_number: string;
  plot_area_sqm: string;
  declared_unit: string | null;
  declared_area: string | null;
  land_classification: string | null;
  irrigation_source: string | null;
  ulpin: string | null;
  bbox_json: BBox | null;
  field_confidence: Record<string, number>;
}

export interface Owner {
  owner_id: string;
  owner_name_vernacular: string;
  owner_name_en: string | null;
  relation_type: RelationType | null;
  relative_name: string | null;
  share_percentage: string;
  share_fraction: string | null;
  bbox_json: BBox | null;
  field_confidence: Record<string, number>;
}

export interface ValidationFinding {
  code: string;
  severity: Severity;
  message: string;
  field_path: string;
  observed?: unknown;
  expected?: unknown;
  delta?: unknown;
}

export interface ConfidenceBreakdown {
  ocr_confidence: number;
  layout_confidence: number;
  math_checks_pass: number;
  total_confidence: number;
  threshold: number;
}

export interface AuditEntry {
  log_id: string;
  field_name: string;
  raw_extracted_value: string | null;
  corrected_value: string | null;
  modified_by_user_id: string;
  role: ActorRole;
  reason: string | null;
  entry_hash: string;
  timestamp: string;
}

export interface KhataDetail {
  khata_id: string;
  document_id: string;
  khata_number: string;
  fasli_year: string | null;
  total_area_sqm: string;
  declared_unit: string | null;
  approval_status: ApprovalStatus;
  confidence: ConfidenceBreakdown;
  village: Village | null;
  parcels: Parcel[];
  owners: Owner[];
  validation_errors: ValidationFinding[];
  document_url: string | null;
  /** One displayable image per page, in order. Box `page` indexes this list. */
  page_urls?: string[];
  page_count: number;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  audit_trail: AuditEntry[];
}

export interface QueueItem {
  khata_id: string;
  khata_number: string;
  document_id: string;
  village: Village | null;
  confidence_score: number;
  critical_error_count: number;
  top_error: string | null;
  parcel_count: number;
  created_at: string;
  approval_status?: ApprovalStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface QueuePage {
  items: QueueItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface DocumentStatus {
  document_id: string;
  original_filename: string;
  processing_status: ProcessingStatus;
  current_step: string | null;
  progress_pct: number;
  page_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  khata_ids: string[];
}

export interface UploadResponse {
  job_id: string;
  document_id: string;
  storage_path: string;
  file_hash_sha256: string;
  processing_status: ProcessingStatus;
  duplicate_of: string | null;
}

export interface ParcelCorrection {
  parcel_id?: string | null;
  khasra_number: string;
  plot_area_sqm: string;
  declared_unit?: string | null;
  declared_area?: string | null;
  land_classification?: string | null;
  delete?: boolean;
}

export interface OwnerCorrection {
  owner_id?: string | null;
  owner_name_vernacular: string;
  owner_name_en?: string | null;
  relation_type?: RelationType | null;
  relative_name?: string | null;
  share_percentage: string;
  aadhaar?: string | null;
  delete?: boolean;
}

export interface VerifyRequest {
  khata_number: string;
  fasli_year?: string | null;
  total_area_sqm: string;
  declared_unit?: string | null;
  parcels: ParcelCorrection[];
  owners: OwnerCorrection[];
  reviewer_id: string;
  role: ActorRole;
  reason?: string | null;
  force_approve?: boolean;
}

export interface VerifyResponse {
  khata_id: string;
  approval_status: ApprovalStatus;
  confidence: ConfidenceBreakdown;
  validation_errors: ValidationFinding[];
  audit_entries_written: number;
  ledger_head: string;
  committed: boolean;
  message: string;
}

export interface RegisterSummary {
  khata_total: number;
  approved: number;
  pending_review: number;
  parcels: number;
  approved_area_hectares: number;
  auto_commit_rate: number;
  mean_confidence: number;
}

export interface UnitDefinition {
  key: string;
  sqm: number;
  aliases: string[];
  region: string;
  authority: string;
}
