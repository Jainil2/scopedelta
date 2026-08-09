import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  decodeCommercialSource,
  parseCommercialSource,
} from "@/server/commercial-parser";

describe("commercial document parser", () => {
  it("extracts deterministic text from PDF and reports image-only PDFs as needs OCR", async () => {
    const document = await PDFDocument.create();
    const page = document.addPage();
    const font = await document.embedFont(StandardFonts.Helvetica);
    page.drawText("Commercial deliverable: authenticated client portal", {
      x: 40,
      y: 700,
      font,
      size: 12,
    });
    const parsed = await parseCommercialSource(
      Buffer.from(await document.save()),
      "pdf",
    );
    expect(parsed).toMatchObject({ state: "ready", errorCode: null });
    expect(parsed.text).toContain("authenticated client portal");

    const blank = await PDFDocument.create();
    blank.addPage();
    await expect(
      parseCommercialSource(Buffer.from(await blank.save()), "pdf"),
    ).resolves.toEqual({
      state: "needs_ocr",
      text: null,
      errorCode: "needs_ocr",
    });
  });

  it("extracts DOCX text without semantic classification", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    );
    zip.file(
      "_rels/.rels",
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    );
    zip.file(
      "word/document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Requirement: tenant-safe project access</w:t></w:r></w:p></w:body></w:document>`,
    );
    const docx = await zip.generateAsync({ type: "nodebuffer" });
    await expect(parseCommercialSource(docx, "docx")).resolves.toEqual({
      state: "ready",
      text: "Requirement: tenant-safe project access",
      errorCode: null,
    });
  });

  it("rejects mismatched file identity before parser work", () => {
    const bytes = Buffer.from("not a pdf");
    expect(() =>
      decodeCommercialSource(
        bytes.toString("base64"),
        "pdf",
        "contract.pdf",
        "application/pdf",
      ),
    ).toThrowError(expect.objectContaining({ code: "source_type_invalid" }));
  });

  it("rejects DOCX archives that expand beyond the parser budget", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Bounded extraction</w:t></w:r></w:p></w:body></w:document>`,
    );
    zip.file("word/media/oversized.txt", "x".repeat(26 * 1024 * 1024));
    const docx = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    await expect(parseCommercialSource(docx, "docx")).resolves.toEqual({
      state: "failed",
      text: null,
      errorCode: "archive_limit_exceeded",
    });
  });
});
