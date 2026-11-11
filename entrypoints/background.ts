import { browser } from "wxt/browser";
import { authorize } from "../src/auth";
import { connect, createChannel, listChannels } from "../src/arena";
import { rankChannels } from "../src/jev";
import type { OpenOverlayMessage, Request, Response } from "../src/protocol";
import { completeJevSetup, getArenaToken, getSettings, saveSettings } from "../src/settings";
import { canOpenOverlay } from "../src/browser";
import { isPdfUrl, type PdfSource } from "../src/pdf-source";

async function sendOpen(tabId: number, message: OpenOverlayMessage): Promise<boolean> {
  try {
    const response = await browser.tabs.sendMessage(tabId, message);
    return !response?.pdf;
  } catch {
    try {
      await browser.scripting.executeScript({ target: { tabId }, files: ["/content-scripts/content.js"] });
      const response = await browser.tabs.sendMessage(tabId, message);
      return !response?.pdf;
    } catch {
      return false;
    }
  }
}

async function openCapture(tab: { id?: number | undefined; url?: string | undefined; title?: string | undefined }, message: OpenOverlayMessage) {
  if (tab.id === undefined || !tab.url || !canOpenOverlay(tab.url)) return;
  if (!isPdfUrl(tab.url) && await sendOpen(tab.id, message)) return;
  if (message.source === "image") return;
  const key = `pdf-capture-${crypto.randomUUID()}`;
  const source: PdfSource = { url: tab.url, title: tab.title ?? "", selectionText: message.selectionText ?? "" };
  await browser.storage.session.set({ [key]: source });
  try {
    await browser.windows.create({ url: `${browser.runtime.getURL("/capture.html")}#${key}`, type: "popup", width: 400, height: 560 });
  } catch (error) {
    await browser.storage.session.remove(key);
    throw error;
  }
}

async function handleRequest(request: Request): Promise<Response> {
  try {
    switch (request.type) {
      case "get-status": {
        const [token, settings] = await Promise.all([getArenaToken(), getSettings()]);
        return {
          ok: true,
          type: "status",
          arenaConnected: token !== null,
          jevConfigured: Boolean(settings.jevApiKey),
        };
      }
      case "authorize":
        await authorize();
        return { ok: true, type: "authorized" };
      case "open-options":
        await browser.tabs.create({ url: browser.runtime.getURL("/options.html") });
        return { ok: true, type: "options-opened" };
      case "open-jev-help":
        await browser.tabs.create({ url: browser.runtime.getURL("/options.html?setup=jev") });
        return { ok: true, type: "jev-help-opened" };
      case "get-settings":
        return { ok: true, type: "settings", settings: await getSettings() };
      case "save-settings":
        await saveSettings(request.settings);
        return { ok: true, type: "saved" };
      case "complete-jev-setup":
        await completeJevSetup(request.jevApiKey);
        return { ok: true, type: "jev-setup-complete" };
      case "list-channels":
        return { ok: true, type: "channels", channels: await listChannels(request.query) };
      case "create-channel":
        return { ok: true, type: "channel-created", channel: await createChannel(request.title, request.visibility) };
      case "rank-channels":
        return { ok: true, type: "ranking", ranking: await rankChannels(request.context, request.channels) };
      case "connect":
        return { ok: true, type: "connected", href: await connect(request.target, request.channelIds) };
      default: {
        const exhaustive: never = request;
        return exhaustive;
      }
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    void openCapture(tab, { type: "open-overlay", source: "page" });
  });

  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({ id: "likely-home-selection", title: "Connect selection to Are.na", contexts: ["selection"] });
      browser.contextMenus.create({ id: "likely-home-image", title: "Connect image to Are.na", contexts: ["image"] });
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id === undefined || !canOpenOverlay(tab.url)) return;
    if (info.menuItemId === "likely-home-selection") {
      void openCapture(tab, { type: "open-overlay", source: "selection", selectionText: info.selectionText ?? "" });
    }
    if (info.menuItemId === "likely-home-image" && info.srcUrl) {
      void openCapture(tab, { type: "open-overlay", source: "image", imageUrl: info.srcUrl });
    }
  });

  browser.runtime.onMessage.addListener((message: unknown) => handleRequest(message as Request));
});
