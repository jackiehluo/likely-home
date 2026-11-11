import { chromium } from "playwright";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const profile = await mkdtemp(join(tmpdir(), "likely-home-pdf-"));
const extensionPath = join(profile, "extension");
await cp(resolve(".output/chrome-mv3"), extensionPath, { recursive: true });
const manifestPath = join(extensionPath, "manifest.json");
const manifest = await Bun.file(manifestPath).json();
manifest.host_permissions.push("http://127.0.0.1/*");
await Bun.write(manifestPath, JSON.stringify(manifest));
// Capture Chrome's real action callback in this disposable test build only.
const backgroundPath = join(extensionPath, "background.js");
const background = await readFile(backgroundPath, "utf8");
await writeFile(backgroundPath, `const registerAction = chrome.action.onClicked.addListener.bind(chrome.action.onClicked);
chrome.action.onClicked.addListener = (listener) => { globalThis.testOpenCapture = listener; registerAction(listener); };
${background}`);

const textPdf = await readFile(resolve("tests/fixtures/hello-world.pdf"));
const emptyPdf = await readFile(resolve("tests/fixtures/empty.pdf"));
const server = createServer((request, response) => {
  if (request.url === "/private.pdf") {
    response.writeHead(200, { "Content-Type": "text/html" });
    return response.end("<!doctype html><title>Sign in</title><p>Private document</p>");
  }
  response.writeHead(200, { "Content-Type": "application/pdf" });
  response.end(request.url === "/empty.pdf" ? emptyPdf : textPdf);
});
await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
const address = server.address();
if (!address || typeof address === "string") throw new Error("PDF test server did not start");
const origin = `http://127.0.0.1:${address.port}`;
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  viewport: null,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
const rankings: { url: string; excerpt: string }[] = [];
let savedUrl: string | null = null;
const errors: string[] = [];
context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
context.on("console", (message) => { if (message.type() === "error") console.error(message.text()); });

try {
  await context.route("https://api.typesafe.ai/**", async (route) => {
    const body = route.request().postDataJSON();
    rankings.push(body.state.page);
    if (!body.state.page.excerpt.includes("Hello, world!")) throw new Error("Jev did not receive the PDF text");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ answers: { home: { choice: "channel_8", probabilities: { channel_7: 0.1, channel_8: 0.9 } } } }) });
  });
  await context.route("https://api.are.na/v3/blocks", async (route) => {
    savedUrl = route.request().postDataJSON().value;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: 123 }) });
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  await worker.evaluate(`chrome.storage.local.set({
    arenaAccessToken: "pdf-smoke-token", jevApiKey: "pdf-smoke-key",
    arenaChannelCache: { fetchedAt: Date.now(), channels: [
      { id: 7, slug: "reading", title: "Reading", description: "", visibility: "private" },
      { id: 8, slug: "architecture", title: "Architecture", description: "", visibility: "public" }
    ] }
  })`);

  const source = await context.newPage();
  async function openPdf(path: string) {
    console.log(`Opening PDF scenario: ${path}`);
    const url = `${origin}${path}`;
    await source.goto(url, { waitUntil: "load" });
    const popupReady = context.waitForEvent("page");
    await worker.evaluate(`(async () => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((item) => item.url === ${JSON.stringify(url)});
      if (!tab) throw new Error("PDF source tab not found");
      globalThis.testOpenCapture(tab);
    })()`);
    const popup = await popupReady.catch((error: unknown) => {
      console.error("Open pages:", context.pages().map((page) => page.url()));
      throw error;
    });
    await popup.waitForURL(/\/capture\.html#/);
    await popup.getByText("PDF", { exact: true }).waitFor();
    await popup.getByText("Architecture", { exact: true }).waitFor();
    return { popup, url };
  }

  for (const path of ["/paper.pdf", "/document"]) {
    const { popup, url } = await openPdf(path);
    await popup.waitForFunction(() => document.querySelector(".lh-channel-title")?.textContent === "Architecture");
    if (rankings.at(-1)?.url !== url) throw new Error("Ranking lost the PDF source URL");
    if (await popup.getByText("Reading PDF…").isVisible()) throw new Error("PDF loading state did not clear");
    await mkdir(resolve("work/verification"), { recursive: true });
    await popup.screenshot({ path: resolve("work/verification/pdf-capture.png") });
    await popup.getByText("Architecture", { exact: true }).click();
    await popup.getByRole("button", { name: "Save to 1", exact: true }).click();
    await popup.getByRole("button", { name: "Saved", exact: true }).waitFor();
    if (savedUrl !== url) throw new Error("Saving a PDF did not preserve its original URL");
    await popup.close();
  }

  const count = rankings.length;
  const { popup } = await openPdf("/empty.pdf");
  await popup.getByText("This PDF has no selectable text. Choose a channel manually.").waitFor();
  if (rankings.length !== count) throw new Error("An empty PDF was sent for classification");
  await popup.getByText("Reading", { exact: true }).click();
  await popup.getByRole("button", { name: "Save to 1", exact: true }).click();
  await popup.getByRole("button", { name: "Saved", exact: true }).waitFor();
  await popup.close();
  const failure = await openPdf("/private.pdf");
  await failure.popup.getByText("This page didn’t return a PDF. You can still choose a channel.").waitFor();
  if (rankings.length !== count) throw new Error("An HTML error page was sent for classification");
  await failure.popup.close();
  if (errors.length) throw new Error(`PDF capture errors: ${errors.join("; ")}`);
  console.log("PDF smoke passed: native PDF tabs, extensionless PDFs, extracted Jev input, original-URL save, and manual fallback");
} finally {
  await context.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
