import { describe, expect, test } from "bun:test";
import { fetchPdf, isPdfUrl, pdfCapture, PDF_BYTE_LIMIT } from "../src/pdf-source";

describe("PDF capture", () => {
  test("recognizes PDF paths with query strings and fragments", () => {
    expect(isPdfUrl("https://example.com/PAPER.PDF?download=1#page=3")).toBe(true);
    expect(isPdfUrl("https://example.com/article?file=paper.pdf")).toBe(false);
  });

  test("keeps the original document URL as the Are.na target", () => {
    const capture = pdfCapture({ url: "https://example.com/paper.pdf#page=2", title: "A paper", selectionText: "" });
    expect(capture.target).toEqual({ kind: "link", url: "https://example.com/paper.pdf#page=2" });
    expect(capture.context.documentType).toBe("pdf");
    expect(capture.context.excerpt).toBe("");
  });

  test("preserves PDF selections and caps the classifier input", () => {
    const capture = pdfCapture({ url: "https://example.com/paper.pdf", title: "Paper", selectionText: "a".repeat(5000) });
    expect(capture.target.kind).toBe("text");
    if (capture.target.kind === "text") expect(capture.target.text).toHaveLength(5000);
    expect(capture.context.selectedText).toHaveLength(4000);
    expect(() => pdfCapture({ url: "javascript:alert(1)", title: "", selectionText: "" })).toThrow();
  });

  test("fetches document bytes with the user's existing access", async () => {
    const data = await fetchPdf("https://example.com/paper.pdf", async (_url, options) => {
      expect(options?.credentials).toBe("include");
      return new Response("%PDF-1.7 test");
    });
    expect(new TextDecoder().decode(data)).toBe("%PDF-1.7 test");
  });

  test("rejects a login page or an HTTP failure instead of classifying it", async () => {
    await expect(fetchPdf("https://example.com/paper.pdf", async () => new Response("<html>Sign in</html>"))).rejects.toThrow("didn’t return a PDF");
    await expect(fetchPdf("https://example.com/paper.pdf", async () => new Response("", { status: 403 }))).rejects.toThrow("Couldn’t read");
  });

  test("rejects large documents before downloading", async () => {
    await expect(fetchPdf("https://example.com/paper.pdf", async () => new Response("%PDF-", { headers: { "content-length": String(PDF_BYTE_LIMIT + 1) } }))).rejects.toThrow("over 20 MB");
  });

  test("also caps streamed downloads without a content length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(PDF_BYTE_LIMIT));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    await expect(fetchPdf("https://example.com/paper.pdf", async () => new Response(stream))).rejects.toThrow("over 20 MB");
  });
});
