import { describe, expect, it } from "vitest";
import { detectFileContent, isOfficePreviewType } from "./preview-file-type";

function zipHead(entryName: string): Buffer {
  const name = Buffer.from(entryName, "utf8");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(0, 18);
  header.writeUInt32LE(0, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, name, Buffer.from([0x50, 0x4b, 0x01, 0x02])]);
}

const docx = () => zipHead("[Content_Types].xml");
const xlsx = () => zipHead("[Content_Types].xml");
const pptx = () => zipHead("[Content_Types].xml");
const odt = () => zipHead("mimetype");
const ole = () => Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504, 0)]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 0)]);
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 0)]);
const dwg = () => Buffer.concat([Buffer.from("AC1032", "latin1"), Buffer.alloc(64, 0)]);
const dxf = () => Buffer.from("0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1027\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n", "latin1");

describe("detectFileContent", () => {
  it("recognises a real PDF header", () => {
    const result = detectFileContent(Buffer.from("%PDF-1.7\n1 0 obj\n"), "contract.pdf", "application/pdf");
    expect(result).toMatchObject({ type: "pdf", family: "pdf", mismatch: false, mimeType: "application/pdf" });
  });

  it("recognises OOXML documents by their zip signature and content-types entry", () => {
    expect(
      detectFileContent(docx(), "report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toMatchObject({
      type: "docx",
      family: "office",
      mismatch: false,
    });
    expect(detectFileContent(xlsx(), "sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toMatchObject({
      type: "xlsx",
      family: "office",
      mismatch: false,
    });
    expect(
      detectFileContent(pptx(), "slides.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ).toMatchObject({ type: "pptx", family: "office", mismatch: false });
  });

  it("recognises OpenDocument files and legacy OLE documents", () => {
    expect(detectFileContent(odt(), "text.odt", "application/vnd.oasis.opendocument.text")).toMatchObject({
      type: "odt",
      mismatch: false,
    });
    expect(detectFileContent(ole(), "legacy.doc", "application/msword")).toMatchObject({ type: "doc", mismatch: false });
    expect(detectFileContent(ole(), "legacy.xls", "application/vnd.ms-excel")).toMatchObject({ type: "xls", mismatch: false });
    expect(detectFileContent(ole(), "legacy.ppt", "application/vnd.ms-powerpoint")).toMatchObject({ type: "ppt", mismatch: false });
  });

  it("rejects a file whose content does not match its extension", () => {
    const result = detectFileContent(Buffer.from("%PDF-1.7\n"), "fake.docx", "application/pdf");
    expect(result.type).toBe("pdf");
    expect(result.mismatch).toBe(true);
  });

  it("rejects a zip archive renamed to docx when it is not an OOXML package", () => {
    const result = detectFileContent(zipHead("photos/image.jpg"), "fake.docx", "application/octet-stream");
    expect(result.type).toBe("unknown");
    expect(result.mismatch).toBe(true);
  });

  it("recognises browser images", () => {
    expect(detectFileContent(png(), "photo.png", "image/png")).toMatchObject({ type: "image", mimeType: "image/png", mismatch: false });
    expect(detectFileContent(jpeg(), "photo.jpg", "image/jpeg")).toMatchObject({ type: "image", mimeType: "image/jpeg" });
    expect(detectFileContent(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "drawing.svg", "image/svg+xml")).toMatchObject({
      type: "unknown",
      mismatch: true,
    });
    expect(detectFileContent(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "logo.png", "image/png")).toMatchObject({
      type: "unknown",
      mismatch: true,
    });
  });

  it("recognises DXF text, binary DXF and DWG versions", () => {
    expect(detectFileContent(dxf(), "plan.dxf", "application/dxf")).toMatchObject({ type: "dxf", family: "cad", mismatch: false });
    expect(detectFileContent(Buffer.from("AutoCAD Binary DXF\r\n\x1a\x00rest", "latin1"), "plan.dxf", "application/dxf")).toMatchObject({
      type: "dxf",
    });
    expect(detectFileContent(dwg(), "plan.dwg", "image/vnd.dwg")).toMatchObject({ type: "dwg", family: "cad", mismatch: false });
  });

  it("treats plain text as previewable and binary data as unsupported", () => {
    expect(detectFileContent(Buffer.from("name,value\nalpha,1\n"), "data.csv", "text/csv")).toMatchObject({
      type: "text",
      mismatch: false,
    });
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09]);
    expect(detectFileContent(binary, "blob.bin", "application/octet-stream")).toMatchObject({ type: "unknown" });
  });
});

describe("detectFileContent edge cases", () => {
  const text = (value = "plain text\n") => Buffer.from(value, "utf8");

  it("treats dot-files, extension-less names and a missing mime as extension-less", () => {
    expect(detectFileContent(text(), ".env", "text/plain")).toMatchObject({ declaredExtension: "", type: "text" });
    expect(detectFileContent(text(), "README", undefined as unknown as string)).toMatchObject({ declaredExtension: "", type: "text" });
    expect(detectFileContent(text(), "README", "")).toMatchObject({ declaredExtension: "", type: "text" });
  });

  it("compares the declared mime family when the name carries no known extension", () => {
    expect(detectFileContent(text(), "blob.bin", "application/msword").mismatch).toBe(true);
    expect(detectFileContent(text(), "blob.bin", "application/pdf").mismatch).toBe(true);
    expect(detectFileContent(text(), "blob.bin", "application/dxf").mismatch).toBe(true);
    expect(detectFileContent(text(), "blob.bin", "image/png").mismatch).toBe(true);
    expect(detectFileContent(text(), "blob.bin", "application/xml").mismatch).toBe(false);
    expect(detectFileContent(text(), "blob.bin", "application/x-unknown").mismatch).toBe(false);
  });

  it("rejects short or malformed zip headers as unknown", () => {
    expect(detectFileContent(Buffer.from([0x50, 0x4b, 0x03]), "weird.bin", "application/octet-stream")).toMatchObject({ type: "unknown" });
    expect(detectFileContent(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]), "weird.bin", "application/octet-stream")).toMatchObject({
      type: "unknown",
    });
    const emptyName = Buffer.alloc(30);
    emptyName.writeUInt32LE(0x04034b50, 0);
    emptyName.writeUInt16LE(0, 26);
    expect(detectFileContent(emptyName, "weird.bin", "application/octet-stream")).toMatchObject({ type: "unknown" });
  });

  it("refuses a zip whose entries do not name a known office package", () => {
    expect(detectFileContent(zipHead("mimetype"), "report.docx", "application/octet-stream")).toMatchObject({
      type: "unknown",
      mismatch: true,
    });
    expect(detectFileContent(zipHead("[Content_Types].xml"), "blob.bin", "application/octet-stream")).toMatchObject({ type: "unknown" });
    expect(detectFileContent(ole(), "blob.bin", "application/octet-stream")).toMatchObject({ type: "unknown" });
  });

  it("recognises GIF, BMP, WebP and TIFF headers", () => {
    expect(detectFileContent(Buffer.from("GIF89a...."), "anim.gif", "image/gif")).toMatchObject({ mimeType: "image/gif" });
    expect(detectFileContent(Buffer.from("BM....", "latin1"), "photo.bmp", "image/bmp")).toMatchObject({ mimeType: "image/bmp" });
    expect(
      detectFileContent(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]), "photo.webp", "image/webp"),
    ).toMatchObject({ mimeType: "image/webp" });
    expect(detectFileContent(Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0]), "scan.tif", "image/tiff")).toMatchObject({
      mimeType: "image/tiff",
    });
  });

  it("does not mistake RIFF containers or tiny buffers for images", () => {
    expect(detectFileContent(Buffer.from("RIFF\0\0\0\0WAVEfmt ", "latin1"), "audio.wav", "application/octet-stream")).toMatchObject({
      type: "unknown",
    });
    expect(detectFileContent(Buffer.from([0, 0, 0, 0]), "blob.bin", "application/octet-stream")).toMatchObject({ type: "unknown" });
    expect(detectFileContent(Buffer.from([0, 0]), "blob.bin", "application/octet-stream")).toMatchObject({ type: "unknown" });
  });

  it("treats an XML declaration without SVG as plain text", () => {
    expect(detectFileContent(Buffer.from('<?xml version="1.0"?><root/>'), "feed.xml", "application/xml")).toMatchObject({
      type: "text",
      mismatch: false,
    });
  });

  it("flags a mime family that contradicts the bytes for pdf, dxf and dwg names", () => {
    expect(detectFileContent(text(), "fake.pdf", "text/plain").mismatch).toBe(true);
    expect(detectFileContent(text(), "fake.dxf", "text/plain").mismatch).toBe(true);
    expect(detectFileContent(text(), "fake.dwg", "text/plain").mismatch).toBe(true);
  });

  it("rejects text that claims an OOXML or legacy office extension", () => {
    for (const name of ["fake.docx", "fake.xlsx", "fake.pptx", "fake.doc", "fake.xls", "fake.ppt"]) {
      expect(detectFileContent(text(), name, "application/octet-stream")).toMatchObject({ type: "unknown" });
    }
  });

  it("reads the commented ASCII DXF form and an empty buffer", () => {
    expect(
      detectFileContent(Buffer.from("999\r\ncomment\r\n0\r\nSECTION\r\n2\r\nHEADER\r\n", "latin1"), "plan.dxf", "application/dxf"),
    ).toMatchObject({
      type: "dxf",
    });
    expect(detectFileContent(Buffer.alloc(0), "empty.bin", "application/octet-stream")).toMatchObject({ type: "unknown" });
  });

  it("rejects a zip archive that claims a legacy binary office extension", () => {
    for (const name of ["legacy.doc", "legacy.xls", "legacy.ppt"]) {
      expect(detectFileContent(zipHead("[Content_Types].xml"), name, "application/octet-stream")).toMatchObject({ type: "unknown" });
    }
  });

  it("refuses bytes that are not valid UTF-8 as text", () => {
    expect(detectFileContent(Buffer.from([0xff, 0xfe, 0x41]), "blob.bin", "application/octet-stream")).toMatchObject({ type: "unknown" });
  });

  it("answers which detected types the office preview pipeline accepts", () => {
    expect(isOfficePreviewType("docx")).toBe(true);
    expect(isOfficePreviewType("odp")).toBe(true);
    expect(isOfficePreviewType("pdf")).toBe(false);
    expect(isOfficePreviewType("image")).toBe(false);
  });
});
