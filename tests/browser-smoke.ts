import { chromium } from "playwright";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const extensionSourcePath = resolve(".output/chrome-mv3");
const evidencePath = resolve("work/verification/browser-smoke.png");
const optionsEvidencePath = resolve("work/verification/options.png");
const profile = await mkdtemp(join(tmpdir(), "likely-home-"));
const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end("<!doctype html><title>Likely Home Smoke</title><main><h1>Example page</h1><p>A small page about architecture and interfaces.</p></main>");
});
await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Smoke server did not start");
const pageUrl = `http://127.0.0.1:${address.port}/`;
const extensionPath = join(profile, "extension");
await cp(extensionSourcePath, extensionPath, { recursive: true });
const manifestPath = join(extensionPath, "manifest.json");
const manifest = await Bun.file(manifestPath).json() as { host_permissions: string[] };
manifest.host_permissions.push("http://127.0.0.1/*");
await Bun.write(manifestPath, `${JSON.stringify(manifest)}\n`);
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  viewport: { width: 1280, height: 800 },
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

try {
  const page = await context.newPage();
  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  await page.waitForTimeout(500);
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  await worker.evaluate(`(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (tabId === undefined) throw new Error("No active tab");
    await chrome.scripting.executeScript({ target: { tabId }, files: ["/content-scripts/content.js"] });
    await chrome.tabs.sendMessage(tabId, { type: "open-overlay", source: "page" });
  })()`);
  await page.locator("likely-home-overlay").waitFor({ state: "attached" });
  await page.getByRole("dialog", { name: "Connect to Are.na" }).waitFor({ state: "visible" });
  await page.getByRole("img", { name: "Likely Home on Are.na" }).waitFor({ state: "visible" });
  const button = page.getByRole("button", { name: "Continue with Are.na" });
  await button.waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Close" }).click();

  await context.route("https://api.are.na/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/v3/me") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 42, slug: "smoke-user" }) });
      return;
    }
    if (request.method() === "GET" && url.pathname === "/v3/users/42/contents") {
      const pageNumber = Number(url.searchParams.get("page"));
      const allChannels = [
        { id: 7, slug: "reading", title: "Reading", description: { plain: "Things to read" }, visibility: "private", can: { add_to: true } },
        { id: 8, slug: "references", title: "References", description: { plain: "Visual research" }, visibility: "public", can: { add_to: true } },
        ...Array.from({ length: 24 }, (_, index) => ({
          id: 100 + index,
          slug: `overflow-${index}`,
          title: `Overflow channel ${index}`,
          description: { plain: "" },
          visibility: "closed",
          can: { add_to: true },
        })),
      ];
      const data = pageNumber === 1 ? allChannels.slice(0, 24) : allChannels.slice(24);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data, meta: { current_page: pageNumber, total_pages: 2 } }),
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/v3/channels") {
      const body = route.request().postDataJSON();
      if (body.title !== "Shared references" || body.visibility !== "public") {
        throw new Error(`Wrong channel creation body: ${JSON.stringify(body)}`);
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: 12, slug: "shared-references", title: "Shared references", visibility: "public" }),
      });
      return;
    }
    await route.fulfill({ status: 504, contentType: "text/html", body: "<!doctype html><title>504 Gateway time-out</title>" });
  });
  await worker.evaluate(`chrome.storage.local.set({
    arenaAccessToken: "smoke-token"
  })`);
  await worker.evaluate(`(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tabs[0].id, { type: "open-overlay", source: "page" });
  })()`);
  await page.getByRole("heading", { name: "Add Jev" }).waitFor({ state: "visible" });
  const jevHelpPagePromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Where do I get a key?" }).click();
  const jevHelpPage = await jevHelpPagePromise;
  await jevHelpPage.waitForLoadState("domcontentloaded");
  if (!jevHelpPage.url().endsWith("/options.html?setup=jev")) throw new Error(`Jev help opened the wrong page: ${jevHelpPage.url()}`);
  await jevHelpPage.getByRole("heading", { name: "add jev" }).waitFor({ state: "visible" });
  if (await jevHelpPage.getByRole("button", { name: "connect are.na" }).isVisible()) throw new Error("Jev-only help repeats Are.na setup");
  await jevHelpPage.close();
  await page.getByRole("textbox", { name: "API key" }).fill("apikey_smoke");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText("Reading", { exact: true }).waitFor({ state: "visible" });
  await page.getByText("References", { exact: true }).waitFor({ state: "visible" });
  if (await page.getByText("Likely homes").isVisible()) throw new Error("The likely-home label is still visible");
  if (await page.getByText("Private", { exact: true }).isVisible()) throw new Error("Channel visibility is still visible");
  if (await page.getByText("Are.na is temporarily unavailable. Try again.").isVisible()) throw new Error("A refresh failure hid the cached channel list");
  if (await page.getByText("Save to channels").isVisible()) throw new Error("The redundant channel heading is still visible");
  if (await page.getByText("Sorted by Jev").isVisible()) throw new Error("The redundant ranking label is still visible");
  if (await page.getByRole("button", { name: "Edit block" }).isVisible()) throw new Error("The inert Edit block control is still visible");
  await page.getByRole("button", { name: "+ New channel" }).click();
  await page.getByRole("textbox", { name: "Channel name" }).fill("Shared references");
  await page.getByText("Public", { exact: true }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByText("Shared references", { exact: true }).waitFor({ state: "visible" });
  const createdRow = page.locator(".lh-channel", { hasText: "Shared references" });
  if (!(await createdRow.locator("input").isChecked())) throw new Error("New channel was not selected");
  const readingRow = page.locator(".lh-channel", { hasText: "Reading" });
  await readingRow.click();
  if (!(await readingRow.locator("input").isChecked()) || !(await createdRow.locator("input").isChecked())) {
    throw new Error("Selecting a second channel lost the existing selection");
  }
  await page.getByRole("button", { name: "Save to 2" }).waitFor({ state: "visible" });
  await page.setViewportSize({ width: 385, height: 251 });
  const shortChannelList = await page.locator(".lh-channels").boundingBox();
  if (!shortChannelList || shortChannelList.height < 40) throw new Error(`Channel list collapsed in a short viewport: ${JSON.stringify(shortChannelList)}`);
  await page.getByRole("button", { name: "+ New channel" }).waitFor({ state: "visible" });
  await page.setViewportSize({ width: 1280, height: 800 });
  const storedJevKey = await worker.evaluate(`chrome.storage.local.get("jevApiKey").then((stored) => stored.jevApiKey)`);
  if (storedJevKey !== "apikey_smoke") throw new Error("First-run Jev key was not stored");
  const panel = await page.getByRole("dialog", { name: "Connect to Are.na" }).boundingBox();
  if (!panel || panel.width > 370 || panel.height > 490) throw new Error(`Capture panel is not compact: ${JSON.stringify(panel)}`);
  const footer = await page.locator(".lh-footer").boundingBox();
  if (!footer || footer.height > 60) throw new Error(`Capture footer expanded into the channel list: ${JSON.stringify(footer)}`);
  const panelScrollTop = await page.getByRole("dialog", { name: "Connect to Are.na" }).evaluate((element) => {
    element.scrollTop = 100;
    return element.scrollTop;
  });
  if (panelScrollTop !== 0) throw new Error(`The fixed panel can scroll away from its frame: ${panelScrollTop}`);
  if ((await page.locator("likely-home-overlay").innerText()).includes("<!doctype")) throw new Error("HTML error response leaked into the interface");
  const optionsPagePromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Preferences" }).click();
  const optionsPage = await optionsPagePromise;
  await optionsPage.waitForLoadState("domcontentloaded");
  if (!optionsPage.url().endsWith("/options.html")) throw new Error("Preferences did not open the extension options page");
  await optionsPage.getByRole("heading", { name: "likely home" }).waitFor({ state: "visible" });
  await optionsPage.getByRole("heading", { name: "setup" }).waitFor({ state: "visible" });
  if (await optionsPage.getByText("oauth app", { exact: false }).isVisible()) throw new Error("Obsolete OAuth app setup is still visible");
  if (await optionsPage.getByText("redirect url", { exact: false }).isVisible()) throw new Error("Obsolete OAuth redirect setup is still visible");
  await optionsPage.getByRole("link", { name: "typesafe jev api key" }).waitFor({ state: "visible" });
  await optionsPage.getByRole("button", { name: "copy prompt" }).waitFor({ state: "visible" });
  await mkdir(resolve("work/verification"), { recursive: true });
  await page.screenshot({ path: evidencePath });
  await optionsPage.screenshot({ path: optionsEvidencePath, fullPage: true });
  console.log("browser smoke passed: onboarding, fresh v3 channel pagination, channel creation, compact capture, and Jev-only help rendered");
} finally {
  await context.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
