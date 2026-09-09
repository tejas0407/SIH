import axios from "axios";
import { readSession, sessionToken, writeSession } from "./session";
import type {
  DocumentStatus,
  KhataDetail,
  QueuePage,
  RegisterSummary,
  UnitDefinition,
  UploadResponse,
  VerifyRequest,
  VerifyResponse,
} from "./types";

const baseURL =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";

export const api = axios.create({ baseURL, timeout: 30_000 });

// Every protected route reads the actor off this token, so attach it to all
// requests once the reviewer has signed in.
api.interceptors.request.use((config) => {
  const token = sessionToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;

    // A 401 means the token is missing, expired or rejected. Drop the stale
    // session and send the reviewer to sign in again, preserving where they
    // were so they land back there afterwards.
    if (status === 401 && typeof window !== "undefined") {
      const hadSession = readSession() !== null;
      writeSession(null);
      const onLogin = window.location.pathname === "/login";
      if (hadSession && !onLogin) {
        const next = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        window.location.assign(`/login?next=${next}`);
      }
    }

    // The API returns a readable `detail` on every error path; surface that
    // rather than the axios stack, which tells a reviewer nothing.
    const detail = error?.response?.data?.detail;
    if (detail) error.message = typeof detail === "string" ? detail : JSON.stringify(detail);
    return Promise.reject(error);
  },
);

export async function uploadScan(
  file: File,
  villageCode?: string,
  onProgress?: (pct: number) => void,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  if (villageCode) form.append("village_code", villageCode);

  const { data } = await api.post<UploadResponse>("/documents/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return data;
}

export async function fetchDocumentStatus(id: string): Promise<DocumentStatus> {
  const { data } = await api.get<DocumentStatus>(`/documents/${id}/status`);
  return data;
}

export async function fetchDocuments(limit = 25): Promise<DocumentStatus[]> {
  const { data } = await api.get<DocumentStatus[]>("/documents", { params: { limit } });
  return data;
}

export async function fetchQueue(
  page = 1,
  pageSize = 20,
  sort: "confidence" | "oldest" | "newest" = "confidence",
): Promise<QueuePage> {
  const { data } = await api.get<QueuePage>("/hitl/queue", {
    params: { page, page_size: pageSize, sort },
  });
  return data;
}

export async function fetchKhata(khataId: string): Promise<KhataDetail> {
  const { data } = await api.get<KhataDetail>(`/hitl/${khataId}`);
  return data;
}

export async function verifyKhata(
  khataId: string,
  body: VerifyRequest,
): Promise<VerifyResponse> {
  const { data } = await api.put<VerifyResponse>(`/hitl/${khataId}/verify`, body);
  return data;
}

export async function rejectKhata(
  khataId: string,
  reason: string,
): Promise<VerifyResponse> {
  const { data } = await api.post<VerifyResponse>(`/hitl/${khataId}/reject`, null, {
    params: { reason },
  });
  return data;
}

export async function fetchLedger(khataId: string) {
  const { data } = await api.get(`/hitl/${khataId}/ledger`);
  return data as { intact: boolean; entries_checked: number; head?: string; broken_at?: string };
}

export async function fetchSummary(): Promise<RegisterSummary> {
  const { data } = await api.get<RegisterSummary>("/reports/summary");
  return data;
}

export async function fetchUnits(): Promise<UnitDefinition[]> {
  const { data } = await api.get<UnitDefinition[]>("/reports/units");
  return data;
}

export function exportUrl(format: "geojson" | "csv", onlyApproved = true) {
  return `${baseURL}/reports/export?format=${format}&only_approved=${onlyApproved}`;
}
