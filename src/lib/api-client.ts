import type {
  ApiEnvelope,
  ApiErrorResponse,
  DocumentDetailDto,
  DocumentDto,
  DocumentPermissionsDto,
  FileDto,
  FilePreviewDto,
  FolderDto,
  OidcConfigDto,
  Paginated,
  PresignedUploadDto,
  PreviewCacheCleanupDto,
  PreviewCapabilitiesDto,
  ProfileDto,
} from "@edas/shared";
import { API_PREFIX } from "@edas/shared";
import { config } from "../config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly correlationId?: string | null,
    readonly messageAr?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const CSRF_COOKIE = "edas_csrf";
const MUTATING_METHODS = new Set<HttpMethod>(["POST", "PATCH", "PUT", "DELETE"]);

export function serverReason(error: unknown): string | undefined {
  if (!(error instanceof ApiError) || ![400, 403, 404, 409, 413, 422].includes(error.status)) return undefined;
  return error.messageAr ?? error.message;
}

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  baseUrl?: string;
}

export function buildUrl(path: string, query?: RequestOptions["query"], baseUrl?: string): string {
  const base = (baseUrl ?? config.apiBaseUrl ?? "").replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${API_PREFIX}${suffix}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (MUTATING_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  const response = await fetch(buildUrl(path, options.query, options.baseUrl), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    credentials: "include",
  });

  const text = await response.text();
  let payload: unknown = undefined;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const errorBody = typeof payload === "object" && payload !== null ? (payload as ApiErrorResponse) : undefined;
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("edas:unauthorized"));
    }
    throw new ApiError(
      response.status,
      errorBody?.error?.code ?? "HTTP_ERROR",
      errorBody?.error?.message ?? (typeof payload === "string" ? payload : response.statusText),
      errorBody?.error?.details,
      errorBody?.correlationId ?? null,
      errorBody?.error?.messageAr,
    );
  }

  return payload === undefined ? (undefined as T) : (payload as ApiEnvelope<T>).data;
}

export interface ListDocumentsParams {
  q?: string;
  status?: DocumentDto["status"];
  classification?: DocumentDto["classification"];
  folderId?: string;
  departmentId?: string;
  projectId?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}

export function createApiClient() {
  const authed = async <T>(path: string, options: RequestOptions = {}): Promise<T> => apiRequest<T>(path, options);

  return {
    oidcConfig: () => apiRequest<OidcConfigDto>("/auth/config"),
    me: () => authed<ProfileDto>("/auth/me"),
    get: <T>(path: string, options: RequestOptions = {}) => authed<T>(path, options),
    post: <T>(path: string, body?: unknown, options: RequestOptions = {}) => authed<T>(path, { ...options, method: "POST", body }),
    patch: <T>(path: string, body?: unknown, options: RequestOptions = {}) => authed<T>(path, { ...options, method: "PATCH", body }),
    put: <T>(path: string, body?: unknown, options: RequestOptions = {}) => authed<T>(path, { ...options, method: "PUT", body }),
    del: <T>(path: string, options: RequestOptions = {}) => authed<T>(path, { ...options, method: "DELETE" }),
    foldersTree: () => authed<{ items: FolderDto[] }>("/folders/tree"),
    listDocuments: (params: ListDocumentsParams = {}) =>
      authed<Paginated<DocumentDto>>("/documents", { query: params as unknown as Record<string, string | number | boolean | undefined> }),
    getDocument: (id: string) => authed<DocumentDetailDto>(`/documents/${id}`),
    documentPermissions: (id: string) => authed<DocumentPermissionsDto>(`/documents/${id}/permissions`),
    createDocument: (body: Record<string, unknown>) => authed<DocumentDto>("/documents", { method: "POST", body }),
    presignUpload: (body: { fileName: string; mimeType: string; sizeBytes?: number }) =>
      authed<PresignedUploadDto>("/files/presign-upload", { method: "POST", body }),
    registerFile: (body: { storageKey: string; originalName: string; mimeType: string; checksumSha256: string; sizeBytes?: number }) =>
      authed<FileDto>("/files", { method: "POST", body }),
    downloadUrl: (fileId: string, inline = false) =>
      authed<{ url: string; fileName: string }>(`/files/${fileId}/download`, inline ? { query: { inline: true } } : undefined),
    preview: (fileId: string, options: { signal?: AbortSignal } = {}) =>
      authed<FilePreviewDto>(`/preview/files/${fileId}`, { signal: options.signal }),
    retryPreview: (fileId: string) => authed<FilePreviewDto>(`/preview/files/${fileId}/retry`, { method: "POST", body: {} }),
    previewCapabilities: () => authed<PreviewCapabilitiesDto>("/preview/capabilities"),
    cleanupPreviewCache: (olderThanDays = 30) =>
      authed<PreviewCacheCleanupDto>("/preview/cache/cleanup", { method: "POST", body: { olderThanDays } }),
    previewContentUrl: (fileId: string, kind: "original" | "preview") => buildUrl(`/preview/files/${fileId}/content`, { kind }),
  };
}
