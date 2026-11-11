import type { AclAction, AclRuleDto, DocumentDetailDto, DocumentDto, DocumentVersionDto, FolderDto, Paginated } from "@edas/shared";
import { createApiClient, type ListDocumentsParams } from "./api-client";

export interface DocumentCreateBody {
  title: string;
  titleEn?: string;
  description?: string;
  category?: string;
  classification?: DocumentDto["classification"];
  folderId?: string;
  departmentId?: string;
  sectionId?: string;
  projectId?: string;
  tags?: string[];
  fileId: string;
  comment?: string;
}

export interface DocumentUpdateBody {
  title?: string;
  titleEn?: string;
  description?: string;
  category?: string;
  classification?: DocumentDto["classification"];
  transition?: "ARCHIVE" | "REOPEN";
  folderId?: string;
  sectionId?: string;
  projectId?: string;
  tags?: string[];
  retentionEnd?: string;
  reason?: string;
}

export interface FolderCreateBody {
  name: string;
  nameEn?: string;
  type?: FolderDto["type"];
  scope: FolderDto["scope"];
  parentId?: string;
  departmentId?: string;
  projectId?: string;
}

export interface AclRuleInput {
  principalType: "USER" | "DEPARTMENT" | "ROLE";
  principalId: string;
  actions: AclAction[];
  effect?: "ALLOW" | "DENY";
}

const client = createApiClient();

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function uploadToStorage(file: File) {
  const mimeType = file.type || "application/octet-stream";
  const presigned = await client.presignUpload({ fileName: file.name, mimeType, sizeBytes: file.size });
  const put = await fetch(presigned.url, {
    method: presigned.method,
    headers: { "Content-Type": mimeType },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  const checksumSha256 = await sha256Hex(await file.arrayBuffer());
  return client.registerFile({
    storageKey: presigned.storageKey,
    originalName: file.name,
    mimeType,
    checksumSha256,
    sizeBytes: file.size,
  });
}

export const docsApi = {
  foldersTree: () => client.foldersTree(),
  createFolder: (body: FolderCreateBody) => client.post<FolderDto>("/folders", body),
  updateFolder: (id: string, body: { name?: string; nameEn?: string; scope?: FolderDto["scope"]; aclInherit?: boolean }) =>
    client.patch<FolderDto>(`/folders/${id}`, body),
  deleteFolder: (id: string) => client.del<{ id: string; deleted: boolean }>(`/folders/${id}`),
  folderAcl: (id: string) => client.get<AclRuleDto[]>(`/folders/${id}/acl`),
  folderAcls: () => client.get<AclRuleDto[]>("/folders/acls"),
  putFolderAcl: (id: string, rules: AclRuleInput[]) => client.put<AclRuleDto[]>(`/folders/${id}/acl`, { rules }),

  listDocuments: (params: ListDocumentsParams = {}) => client.listDocuments(params),
  trashDocuments: (params: ListDocumentsParams = {}) =>
    client.get<Paginated<DocumentDto>>("/documents/trash", {
      query: params as unknown as Record<string, string | number | boolean | undefined>,
    }),
  getDocument: (id: string) => client.getDocument(id),
  createDocument: (body: DocumentCreateBody) => client.post<DocumentDto>("/documents", body),
  updateDocument: (id: string, body: DocumentUpdateBody) => client.patch<DocumentDto>(`/documents/${id}`, body),
  deleteDocument: (id: string) => client.del<{ id: string; deleted: boolean }>(`/documents/${id}`),
  restoreDocument: (id: string) => client.post<DocumentDto>(`/documents/${id}/restore`, {}),
  purgeDocument: (id: string) => client.del<{ id: string; deleted: boolean; purged?: boolean }>(`/documents/${id}/purge`),
  addVersion: (id: string, body: { fileId: string; comment?: string }) =>
    client.post<{ documentId: string; version: number; fileId: string; isCurrent: boolean }>(`/documents/${id}/versions`, body),
  restoreVersion: (id: string, versionId: string) => client.post<DocumentDetailDto>(`/documents/${id}/versions/${versionId}/restore`, {}),
  checkout: (id: string) => client.post<DocumentDto>(`/documents/${id}/checkout`, {}),
  checkin: (id: string) => client.post<DocumentDto>(`/documents/${id}/checkin`, {}),
  requestSignature: (id: string) => client.post<DocumentDto>(`/documents/${id}/signature/request`, {}),
  sign: (id: string) => client.post<DocumentDto>(`/documents/${id}/signature/sign`, {}),
  declareRecord: (id: string) => client.post<DocumentDto>(`/documents/${id}/declare-record`, {}),
  presignUpload: (body: { fileName: string; mimeType: string; sizeBytes?: number }) => client.presignUpload(body),
  registerFile: (body: { storageKey: string; originalName: string; mimeType: string; checksumSha256: string; sizeBytes?: number }) =>
    client.registerFile(body),
  downloadUrl: (fileId: string, inline = false) => client.downloadUrl(fileId, inline),
  preview: (fileId: string, signal?: AbortSignal) => client.preview(fileId, { signal }),
  retryPreview: (fileId: string) => client.retryPreview(fileId),
  previewCapabilities: () => client.previewCapabilities(),
  previewContentUrl: (fileId: string, kind: "original" | "preview") => client.previewContentUrl(fileId, kind),
  versions: async (id: string): Promise<DocumentVersionDto[]> => (await client.getDocument(id)).versions,

  uploadToStorage,
};
