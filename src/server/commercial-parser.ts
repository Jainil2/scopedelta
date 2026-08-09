import mammoth from "mammoth";
import yauzl from "yauzl";

import type { CommercialSourceKind } from "@/db/schema";
import {
  MAX_COMMERCIAL_EXTRACTED_CHARACTERS,
  MAX_COMMERCIAL_SOURCE_BYTES,
} from "@/lib/commercial-validation";
import { PlatformError } from "@/lib/platform-errors";

const PDF_MEDIA_TYPE = "application/pdf";
const DOCX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_PDF_PAGES = 500;
const MAX_DOCX_ENTRIES = 1_000;
const MAX_DOCX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;

export type CommercialParseResult =
  | { state: "ready"; text: string; errorCode: null }
  | { state: "needs_ocr" | "failed"; text: null; errorCode: string };

export function decodeCommercialSource(
  contentBase64: string,
  kind: CommercialSourceKind,
  name: string,
  mediaType: string,
) {
  if (
    contentBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64)
  ) {
    throw invalidSource("The source content is not valid base64.");
  }
  const content = Buffer.from(contentBase64, "base64");
  if (!content.length || content.length > MAX_COMMERCIAL_SOURCE_BYTES) {
    throw new PlatformError(
      "source_size_invalid",
      413,
      `Commercial sources must be between 1 byte and ${MAX_COMMERCIAL_SOURCE_BYTES} bytes.`,
    );
  }
  validateSourceIdentity(content, kind, name, mediaType);
  return content;
}

export async function parseCommercialSource(
  content: Buffer,
  kind: CommercialSourceKind,
): Promise<CommercialParseResult> {
  try {
    if (kind === "pasted_text") {
      return successfulText(normalizeText(content.toString("utf8")));
    }
    if (kind === "docx") {
      await inspectDocxArchive(content);
      const result = await mammoth.extractRawText({ buffer: content });
      return successfulText(normalizeText(result.value));
    }
    return await parsePdf(content);
  } catch (error) {
    if (error instanceof ParserOutcome) return error.result;
    return { state: "failed", text: null, errorCode: parserErrorCode(error) };
  }
}

async function inspectDocxArchive(content: Buffer) {
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(
      content,
      { lazyEntries: true, autoClose: true },
      (openError, archive) => {
        if (openError || !archive) {
          reject(
            new ParserOutcome({
              state: "failed",
              text: null,
              errorCode: "malformed_docx",
            }),
          );
          return;
        }

        let entries = 0;
        let uncompressedBytes = 0;
        let hasDocument = false;
        let settled = false;
        const fail = (errorCode: string) => {
          if (settled) return;
          settled = true;
          archive.close();
          reject(new ParserOutcome({ state: "failed", text: null, errorCode }));
        };

        archive.on("error", () => fail("malformed_docx"));
        archive.on("entry", (entry) => {
          entries += 1;
          uncompressedBytes += entry.uncompressedSize;
          hasDocument ||= entry.fileName === "word/document.xml";
          if (
            entries > MAX_DOCX_ENTRIES ||
            uncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES
          ) {
            fail("archive_limit_exceeded");
            return;
          }
          archive.readEntry();
        });
        archive.on("end", () => {
          if (settled) return;
          if (!hasDocument) {
            fail("malformed_docx");
            return;
          }
          settled = true;
          resolve();
        });
        archive.readEntry();
      },
    );
  });
}

function validateSourceIdentity(
  content: Buffer,
  kind: CommercialSourceKind,
  name: string,
  mediaType: string,
) {
  if (kind === "pasted_text") {
    if (mediaType !== "text/plain") {
      throw invalidSource("Pasted sources must use text/plain.");
    }
    return;
  }
  if (kind === "pdf") {
    if (
      mediaType !== PDF_MEDIA_TYPE ||
      !name.toLowerCase().endsWith(".pdf") ||
      content.subarray(0, 5).toString("ascii") !== "%PDF-"
    ) {
      throw invalidSource("The selected file is not a valid PDF source.");
    }
    return;
  }
  if (
    mediaType !== DOCX_MEDIA_TYPE ||
    !name.toLowerCase().endsWith(".docx") ||
    content.subarray(0, 2).toString("ascii") !== "PK"
  ) {
    throw invalidSource("The selected file is not a valid DOCX source.");
  }
}

async function parsePdf(content: Buffer): Promise<CommercialParseResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(content),
  });
  const document = await task.promise;
  try {
    if (document.numPages > MAX_PDF_PAGES) {
      throw new ParserOutcome({
        state: "failed",
        text: null,
        errorCode: "page_limit_exceeded",
      });
    }
    const pages: string[] = [];
    let characters = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      characters += pageText.length;
      if (characters > MAX_COMMERCIAL_EXTRACTED_CHARACTERS) {
        throw new ParserOutcome({
          state: "failed",
          text: null,
          errorCode: "extracted_text_limit_exceeded",
        });
      }
      pages.push(pageText);
    }
    const text = normalizeText(pages.join("\n\n"));
    if (text.replace(/\s/g, "").length < 20) {
      return { state: "needs_ocr", text: null, errorCode: "needs_ocr" };
    }
    return successfulText(text);
  } finally {
    await task.destroy();
  }
}

function normalizeText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function successfulText(text: string): CommercialParseResult {
  if (!text) {
    return { state: "failed", text: null, errorCode: "no_extractable_text" };
  }
  if (text.length > MAX_COMMERCIAL_EXTRACTED_CHARACTERS) {
    return {
      state: "failed",
      text: null,
      errorCode: "extracted_text_limit_exceeded",
    };
  }
  return { state: "ready", text, errorCode: null };
}

function parserErrorCode(error: unknown) {
  const name =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : "";
  if (name === "PasswordException") return "password_protected";
  if (name === "InvalidPDFException") return "malformed_pdf";
  return "parser_failed";
}

function invalidSource(message: string) {
  return new PlatformError("source_type_invalid", 400, message);
}

class ParserOutcome extends Error {
  constructor(readonly result: CommercialParseResult) {
    super(result.errorCode ?? "parser_outcome");
  }
}
