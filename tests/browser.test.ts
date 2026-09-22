import { describe, expect, test } from "bun:test";
import { canOpenOverlay } from "../src/browser";

describe("overlay page support", () => {
  test("rejects browser-owned and extension pages", () => {
    expect(canOpenOverlay("chrome://newtab/")).toBe(false);
    expect(canOpenOverlay("chrome-extension://abc/options.html")).toBe(false);
    expect(canOpenOverlay(undefined)).toBe(false);
  });

  test("accepts ordinary pages", () => {
    expect(canOpenOverlay("https://example.com/page")).toBe(true);
    expect(canOpenOverlay("http://localhost:3000/")).toBe(true);
  });
});
