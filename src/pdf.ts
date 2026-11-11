import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PageContext } from "./domain";
import { fetchPdf, PDF_TEXT_LIMIT, PdfReadError } from "./pdf-source";

GlobalWorkerOptions.workerSrc = workerUrl;

export async function readPdfContext(context: PageContext): Promise<PageContext> {
  if (context.selectedText) return context;
  const data = await fetchPdf(context.url);
  const task = getDocument({ data, useWasm: false, disableFontFace: true, useSystemFonts: true, verbosity: 0 });
  const timer = setTimeout(() => void task.destroy(), 10_000);
  try {
    const pdf = await task.promise;
    const excerpts: string[] = [];
    let length = 0;
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 6) && length < PDF_TEXT_LIMIT; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replaceAll(/\s+/g, " ").trim();
      excerpts.push(text);
      length += text.length;
      page.cleanup();
    }
    const excerpt = excerpts.join(" ").trim().slice(0, PDF_TEXT_LIMIT);
    if (!excerpt && !context.selectedText) throw new PdfReadError("This PDF has no selectable text. Choose a channel manually.");
    const metadata = await pdf.getMetadata().catch(() => null);
    const title = metadata?.info && typeof metadata.info === "object" && "Title" in metadata.info && typeof metadata.info.Title === "string" ? metadata.info.Title.trim() : "";
    return { ...context, title: title && !/^untitled$/i.test(title) ? title : context.title, excerpt };
  } catch (error) {
    if (error instanceof PdfReadError) throw error;
    throw new PdfReadError("Couldn’t read this PDF. You can still choose a channel.");
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
}
