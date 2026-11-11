import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { CaptureOverlay } from "../../src/ui/CaptureOverlay";
import { pdfCapture, PdfReadError, type PdfSource } from "../../src/pdf-source";
import { readPdfContext } from "../../src/pdf";
import type { PageContext } from "../../src/domain";
import type { ExtractedCapture } from "../../src/ui/extract";
import "../../src/ui/styles.css";
import "./style.css";

type PdfResult = { context: PageContext | null; notice: string | null };

function PdfCapture({ capture, result }: { capture: ExtractedCapture; result: Promise<PdfResult> }) {
  const [notice, setNotice] = useState<string | null>("Reading PDF…");
  const [rankingContext] = useState(() => result.then((value) => value.context));
  useEffect(() => {
    let active = true;
    void result.then((value) => { if (active) setNotice(value.notice); });
    return () => { active = false; };
  }, [result]);
  return <CaptureOverlay capture={capture} rankingContext={rankingContext} notice={notice} onClose={() => window.close()} />;
}

async function main() {
  const root = createRoot(document.getElementById("root")!);
  try {
    const key = location.hash.slice(1);
    if (!key.startsWith("pdf-capture-")) throw new Error("Open a PDF and click Likely Home to connect it.");
    const stored = await browser.storage.session.get(key);
    await browser.storage.session.remove(key);
    const source = stored[key] as PdfSource | undefined;
    if (!source || typeof source.url !== "string" || typeof source.title !== "string" || typeof source.selectionText !== "string") {
      throw new Error("Open the PDF and click Likely Home again.");
    }
    const capture = pdfCapture(source);
    const result = readPdfContext(capture.context).then((context): PdfResult => ({ context, notice: null })).catch((error: unknown): PdfResult => ({
      context: capture.context.selectedText ? capture.context : null,
      notice: error instanceof PdfReadError ? error.message : "Couldn’t read this PDF. You can still choose a channel.",
    }));
    root.render(<PdfCapture capture={capture} result={result} />);
  } catch (error) {
    root.render(<p role="alert">{error instanceof Error ? error.message : "Couldn’t open this PDF."}</p>);
  }
}

void main();
