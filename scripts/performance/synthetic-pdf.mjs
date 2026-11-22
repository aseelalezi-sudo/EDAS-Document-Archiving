import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const requireApi = createRequire(new URL("../../api/package.json", import.meta.url));
const PdfDocument = requireApi("pdfkit");

export async function makePdf(payloadBytes) {
  const pdf = new PdfDocument();
  pdf.text("EDAS synthetic archive document");
  pdf.file(randomBytes(payloadBytes), { name: "fixture.bin" });
  pdf.end();
  const chunks = [];
  for await (const chunk of pdf) chunks.push(chunk);
  return Buffer.concat(chunks);
}
