import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import { CaptureOverlay } from "../src/ui/CaptureOverlay";
import { extractCapture } from "../src/ui/extract";
import type { OpenOverlayMessage } from "../src/protocol";
import cssText from "../src/ui/styles.css?inline";

export default defineContentScript({
  registration: "runtime",
  main() {
    let host: HTMLElement | null = null;
    let root: Root | null = null;

    const remove = () => {
      root?.unmount();
      host?.remove();
      root = null;
      host = null;
    };

    browser.runtime.onMessage.addListener((message: OpenOverlayMessage) => {
      if (message.type !== "open-overlay") return;
      remove();
      const capture = extractCapture(message);
      host = document.createElement("likely-home-overlay");
      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = cssText;
      const container = document.createElement("div");
      shadow.append(style, container);
      document.body.append(host);
      root = createRoot(container);
      root.render(<CaptureOverlay capture={capture} onClose={remove} />);
    });
  },
});
