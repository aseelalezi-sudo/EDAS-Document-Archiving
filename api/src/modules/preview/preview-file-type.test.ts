import { describe, expect, it } from "vitest";
import { detectFileContent } from "./preview-file-type";

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
const ole = () =>
  Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(504, 0),
  ]);
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
    expect(detectFileContent(docx(), "report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toMatchObject({
      type: "docx",
      family: "office",
      mismatch: false,
    });
    expect(
      detectFileContent(xlsx(), "sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ).toMatchObject({ type: "xlsx", family: "office", mismatch: false });
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
    expect(detectFileContent(Buffer.from("name,value\nalpha,1\n"), "data.csv", "text/csv")).toMatchObject({ type: "text", mismatch: false });
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09]);
    expect(detectFileContent(binary, "blob.bin", "application/octet-stream")).toMatchObject({ type: "unknown" });
  });
});
