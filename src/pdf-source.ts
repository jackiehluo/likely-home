import type { PageContext } from "./domain";
import type { ExtractedCapture } from "./ui/extract";

export type PdfSource = Readonly<{ url: string; title: string; selectionText: string }>;
export const PDF_TEXT_LIMIT = 4000;
export const PDF_BYTE_LIMIT = 20 * 1024 * 1024;
export class PdfReadError extends Error {}

export function isPdfUrl(url: string): boolean {
  return new URL(url).pathname.toLowerCase().endsWith(".pdf");
}

export function pdfCapture(source: PdfSource): ExtractedCapture {
  const url = new URL(source.url);
  if (!["https:", "http:", "file:"].includes(url.protocol)) throw new Error("Open a PDF from a website or file first.");
  let title = source.title || "PDF";
  if (!source.title) {
    try { title = decodeURIComponent(url.pathname.split("/").at(-1) || "PDF"); } catch { /* Keep the PDF label for malformed filenames. */ }
  }
  const context: PageContext = {
    url: source.url,
    title,
    description: "",
    excerpt: "",
    selectedText: source.selectionText.slice(0, PDF_TEXT_LIMIT),
    documentType: "pdf",
  };
  return {
    target: context.selectedText ? { kind: "text", text: source.selectionText, sourceUrl: context.url, sourceTitle: context.title } : { kind: "link", url: context.url },
    context,
  };
}

export async function fetchPdf(url: string, request: (url: string, init: RequestInit) => Promise<Response> = fetch): Promise<Uint8Array> {
  const response = await request(url, { credentials: "include", signal: AbortSignal.timeout(10_000) });
  if (!response.ok || !response.body) throw new PdfReadError("Couldn’t read this PDF. You can still choose a channel.");
  const tooLarge = "This PDF is over 20 MB. Choose a channel manually.";
  if (Number(response.headers.get("content-length")) > PDF_BYTE_LIMIT) {
    await response.body.cancel();
    throw new PdfReadError(tooLarge);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PDF_BYTE_LIMIT) {
        await reader.cancel();
        throw new PdfReadError(tooLarge);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (!new TextDecoder().decode(data.subarray(0, 1024)).includes("%PDF-")) {
    throw new PdfReadError("This page didn’t return a PDF. You can still choose a channel.");
  }
  return data;
}
