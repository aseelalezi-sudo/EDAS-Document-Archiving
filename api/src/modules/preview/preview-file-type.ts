export type PreviewFamily = "pdf" | "office" | "image" | "cad" | "text" | "unknown";

export type DetectedFileType =
  | "pdf"
  | "doc"
  | "docx"
  | "xls"
  | "xlsx"
  | "ppt"
  | "pptx"
  | "odt"
  | "ods"
  | "odp"
  | "image"
  | "dxf"
  | "dwg"
  | "text"
  | "unknown";

export interface DetectedFile {
  type: DetectedFileType;
  family: PreviewFamily;
  mimeType: string;
  extension: string;
  mismatch: boolean;
  declaredExtension: string;
}

const OFFICE_EXTENSIONS: Record<string, DetectedFileType> = {
  doc: "doc",
  docx: "docx",
  xls: "xls",
  xlsx: "xlsx",
  ppt: "ppt",
  pptx: "pptx",
  odt: "odt",
  ods: "ods",
  odp: "odp",
};

const LEGACY_OFFICE: Partial<Record<DetectedFileType, string>> = {
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
};

const TYPE_MIME: Partial<Record<DetectedFileType, string>> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  dxf: "application/dxf",
  dwg: "image/vnd.dwg",
  text: "text/plain",
};

const TYPE_EXTENSION: Partial<Record<DetectedFileType, string>> = {
  pdf: "pdf",
  doc: "doc",
  docx: "docx",
  xls: "xls",
  xlsx: "xlsx",
  ppt: "ppt",
  pptx: "pptx",
  odt: "odt",
  ods: "ods",
  odp: "odp",
  dxf: "dxf",
  dwg: "dwg",
  text: "txt",
};

const OFFICE_FAMILY_TYPES = new Set<DetectedFileType>(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"]);

export function canonicalExtension(type: DetectedFileType): string {
  return TYPE_EXTENSION[type] ?? "bin";
}

export function previewMimeType(type: DetectedFileType): string {
  return TYPE_MIME[type] ?? "application/octet-stream";
}

export function previewFamily(type: DetectedFileType): PreviewFamily {
  if (type === "pdf") return "pdf";
  if (type === "image") return "image";
  if (type === "dxf" || type === "dwg") return "cad";
  if (type === "text") return "text";
  if (OFFICE_FAMILY_TYPES.has(type)) return "office";
  return "unknown";
}

export function isOfficePreviewType(type: DetectedFileType): boolean {
  return OFFICE_FAMILY_TYPES.has(type);
}

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const index = base.lastIndexOf(".");
  return index > 0 ? base.slice(index + 1).toLowerCase() : "";
}

function declaredFamily(mimeType: string | undefined): PreviewFamily | null {
  const value = (mimeType ?? "").toLowerCase().split(";")[0].trim();
  if (!value) return null;
  if (value === "application/pdf") return "pdf";
  if (value.startsWith("image/") || value === "application/acad" || value === "application/x-acad" || value === "application/dwg" || value === "application/x-dwg") {
    return value.includes("dwg") ? "cad" : "image";
  }
  if (value.includes("dxf")) return "cad";
  if (value.includes("word") || value.includes("excel") || value.includes("powerpoint") || value.includes("opendocument") || value.includes("ms-")) {
    return "office";
  }
  if (value.startsWith("text/") || value === "application/xml" || value === "application/json") return "text";
  return null;
}

function isPdf(head: Buffer): boolean {
  return head.length >= 5 && head.subarray(0, 5).toString("latin1") === "%PDF-";
}

function isZip(head: Buffer): boolean {
  if (head.length < 4) return false;
  return head[0] === 0x50 && head[1] === 0x4b && [0x03, 0x05, 0x07].includes(head[2]) && [0x04, 0x06, 0x08].includes(head[3]);
}

function isOle(head: Buffer): boolean {
  const signature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return head.length >= signature.length && head.subarray(0, signature.length).equals(signature);
}

function firstZipEntry(head: Buffer): string | null {
  if (head.length < 30 || !isZip(head)) return null;
  const nameLength = head.readUInt16LE(26);
  const start = 30;
  if (nameLength === 0 || start + nameLength > head.length) return null;
  return head.subarray(start, start + nameLength).toString("utf8");
}

function detectZipType(head: Buffer, declared: string): DetectedFileType | null {
  const entry = firstZipEntry(head);
  if (entry === "mimetype" || head.includes(Buffer.from("mimetypeapplication/vnd.oasis.opendocument"))) {
    return OFFICE_EXTENSIONS[declared] && OFFICE_EXTENSIONS[declared].startsWith("od") ? OFFICE_EXTENSIONS[declared] : null;
  }
  if (entry === "[Content_Types].xml" || head.includes(Buffer.from("[Content_Types].xml"))) {
    return OFFICE_EXTENSIONS[declared] ?? null;
  }
  return null;
}

function imageMime(head: Buffer): string | null {
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 6) {
    const signature = head.subarray(0, 6).toString("latin1");
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  if (head.length >= 2 && head.subarray(0, 2).toString("latin1") === "BM") return "image/bmp";
  if (head.length >= 12 && head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  if (head.length >= 4) {
    const tiff = head.subarray(0, 4);
    if (tiff.equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || tiff.equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))) return "image/tiff";
  }
  const text = head.subarray(0, 2048).toString("utf8").replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if (text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"))) return "image/svg+xml";
  return null;
}

function isBinaryDxf(head: Buffer): boolean {
  return head.length >= 22 && head.subarray(0, 22).toString("latin1") === "AutoCAD Binary DXF\r\n\x1a\x00";
}

function isAsciiDxf(head: Buffer): boolean {
  const start = head
    .subarray(0, Math.min(head.length, 512))
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trimStart();
  if (/^0\s*[\r\n]+\s*SECTION/i.test(start)) return true;
  return /^999\s*[\r\n]/.test(start) && /SECTION/i.test(start);
}

function dwgVersion(head: Buffer): string | null {
  if (head.length < 6) return null;
  const signature = head.subarray(0, 6).toString("latin1");
  return /^AC(?:\d\.\d|\d{4})$/.test(signature) ? signature : null;
}

function looksLikeText(head: Buffer): boolean {
  if (head.length === 0) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head);
  } catch {
    return false;
  }
  let control = 0;
  for (const byte of head) {
    if (byte === 0) return false;
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) control += 1;
  }
  return control / head.length < 0.02;
}

export function detectFileContent(head: Buffer, originalName: string, declaredMimeType: string): DetectedFile {
  const declared = extensionOf(originalName);
  const expected = OFFICE_EXTENSIONS[declared];
  const base: Omit<DetectedFile, "type" | "family" | "mimeType" | "extension" | "mismatch"> = { declaredExtension: declared };

  const build = (type: DetectedFileType, mimeType?: string): DetectedFile => {
    const family = previewFamily(type);
    let mismatch = false;
    if (expected) {
      mismatch = family !== previewFamily(expected);
    } else {
      const declaredFamilyType = declaredFamily(declaredMimeType);
      if (declaredFamilyType && declaredFamilyType !== family) mismatch = true;
      if (declared === "pdf" && type !== "pdf") mismatch = true;
      if (declared === "dxf" && type !== "dxf") mismatch = true;
      if (declared === "dwg" && type !== "dwg") mismatch = true;
      if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg"].includes(declared) && type !== "image") mismatch = true;
    }
    return { ...base, type, family, mimeType: mimeType ?? previewMimeType(type), extension: canonicalExtension(type), mismatch };
  };

  if (isPdf(head)) return build("pdf");
  if (isBinaryDxf(head) || isAsciiDxf(head)) return build("dxf");
  if (dwgVersion(head)) return build("dwg");

  if (isZip(head)) {
    if (expected === "doc" || expected === "xls" || expected === "ppt") return build("unknown");
    const zipType = detectZipType(head, declared);
    if (zipType) return build(zipType);
    return build("unknown");
  }

  if (isOle(head)) {
    if (expected && LEGACY_OFFICE[expected]) return build(expected);
    return build("unknown");
  }

  const mime = imageMime(head);
  if (mime) {
    if (mime === "image/svg+xml") return { ...build("unknown"), mismatch: true };
    return build("image", mime);
  }

  if (looksLikeText(head)) {
    if (expected === "docx" || expected === "xlsx" || expected === "pptx") return build("unknown");
    if (expected === "doc" || expected === "xls" || expected === "ppt") return build("unknown");
    return build("text");
  }

  return build("unknown");
}
