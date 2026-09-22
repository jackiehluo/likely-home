import type { CaptureTarget, PageContext } from "../domain";
import type { OpenOverlayMessage } from "../protocol";

export type ExtractedCapture = Readonly<{ target: CaptureTarget; context: PageContext }>;

function text(selector: string): string {
  return document.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? "";
}

function pageContext(selectedText: string): PageContext {
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  return {
    url: canonical || location.href,
    title: document.title.trim(),
    description: text('meta[name="description"]') || text('meta[property="og:description"]'),
    excerpt: (document.body?.innerText ?? "").replaceAll(/\s+/g, " ").trim().slice(0, 4000),
    selectedText: selectedText.slice(0, 4000),
  };
}

function arenaTarget(url: string): CaptureTarget | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "www.are.na" && parsed.hostname !== "are.na") return null;
    const block = parsed.pathname.match(/^\/block\/(\d+)/);
    if (block?.[1]) return { kind: "arena-block", blockId: Number(block[1]), sourceUrl: url };
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 2 && parts[1]) return { kind: "arena-channel", slug: parts[1], sourceUrl: url };
    return null;
  } catch {
    return null;
  }
}

export function extractCapture(message: OpenOverlayMessage): ExtractedCapture {
  const selectedText = message.selectionText?.trim() || window.getSelection()?.toString().trim() || "";
  const context = pageContext(selectedText);
  if (message.source === "selection" && selectedText) {
    return { target: { kind: "text", text: selectedText, sourceUrl: context.url, sourceTitle: context.title }, context };
  }
  if (message.source === "image" && message.imageUrl) {
    return { target: { kind: "image", imageUrl: message.imageUrl, sourceUrl: context.url, sourceTitle: context.title }, context };
  }
  const existing = arenaTarget(context.url);
  if (existing) return { target: existing, context };
  return { target: { kind: "link", url: context.url }, context };
}
