import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const storeDirectory = resolve("store");
await mkdir(storeDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 440px; height: 280px; margin: 0; }
      body { display: grid; grid-template-columns: 150px 1fr; align-items: center; gap: 28px; padding: 36px; background: #f3f0e8; color: #171717; font-family: Arial, Helvetica, sans-serif; }
      svg { width: 142px; height: 142px; }
      h1 { margin: 0 0 10px; font-size: 31px; line-height: .98; letter-spacing: -.055em; }
      p { margin: 0; color: #555; font-size: 14px; line-height: 1.35; }
    </style>
    <svg viewBox="0 0 512 512" aria-hidden="true">
      <path fill="#1a1a1a" d="M8 216 256 10l248 206h-40v286H48V216H8Z"/>
      <text x="256" y="472" fill="#fff" font-family="Arial Unicode MS, Arial" font-size="190" letter-spacing="-20" text-anchor="middle">✶✶</text>
    </svg>
    <div><h1>Likely Home for Are.na</h1><p>Find the channel where a page belongs.</p></div>`);
  await page.screenshot({ path: resolve(storeDirectory, "small-promo-440x280.png") });
} finally {
  await browser.close();
}

await copyFile(resolve("public/icons/icon-128.png"), resolve(storeDirectory, "icon-128.png"));
await copyFile(resolve("work/verification/browser-smoke.png"), resolve(storeDirectory, "screenshot-1280x800.png"));
console.log("store assets written to store/");
