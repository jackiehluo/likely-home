import { describe, expect, test } from "bun:test";
import { createStoreClient, validateVersion } from "../scripts/chrome-webstore";

const config = { publisherId: "publisher", itemId: "a".repeat(32), token: "test-token" };
const zip = new Blob(["test ZIP"]);
function fixture(responses: unknown[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createStoreClient(config, async (url, init) => {
    calls.push({ url, init });
    if (!responses.length) throw new Error("Unexpected request");
    const next = responses.shift();
    return next instanceof Response ? next : Response.json(next);
  }, async () => {});
  return { calls, client };
}

describe("Chrome submission", () => {
  test("uploads raw ZIP, waits for async success, and requests normal review", async () => {
    const { calls, client } = fixture([{}, { uploadState: "IN_PROGRESS" }, { lastAsyncUploadState: "IN_PROGRESS" }, { lastAsyncUploadState: "SUCCEEDED" }, { state: "PENDING_REVIEW" }]);
    expect((await client.submit(zip, "1.2.3")).state).toBe("PENDING_REVIEW");
    expect(calls[1]!.url).toContain("/upload/v2/");
    expect(calls[1]!.init.body).toBe(zip);
    expect(JSON.parse(calls[4]!.init.body as string)).toEqual({ publishType: "DEFAULT_PUBLISH", blockOnWarnings: true });
  });

  test("handles synchronous upload success", async () => {
    const { calls, client } = fixture([{}, { uploadState: "SUCCEEDED" }, { state: "PENDING_REVIEW" }]);
    await client.submit(zip, "1");
    expect(calls).toHaveLength(3);
  });

  for (const state of ["FAILED", "NOT_FOUND", undefined]) {
    test(`never publishes after upload state ${state}`, async () => {
      const { calls, client } = fixture([{}, { uploadState: "IN_PROGRESS" }, { lastAsyncUploadState: state }]);
      await expect(client.submit(zip, "1")).rejects.toThrow("nothing was submitted");
      expect(calls.some((call) => call.url.endsWith(":publish"))).toBe(false);
    });
  }

  test("stops polling after a bounded wait", async () => {
    const { calls, client } = fixture([{}, { uploadState: "IN_PROGRESS" }, ...Array.from({ length: 60 }, () => ({ lastAsyncUploadState: "IN_PROGRESS" }))]);
    await expect(client.submit(zip, "1")).rejects.toThrow("nothing was submitted");
    expect(calls).toHaveLength(62);
  });

  test("does not replace an existing review", async () => {
    const { calls, client } = fixture([{ submittedItemRevisionStatus: { state: "PENDING_REVIEW" } }]);
    await expect(client.submit(zip, "1")).rejects.toThrow("existing submission");
    expect(calls).toHaveLength(1);
  });

  test("requires a version higher than the published package", async () => {
    const { calls, client } = fixture([{ publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: "1.0.0" }] } }]);
    await expect(client.submit(zip, "1")).rejects.toThrow("Increase version");
    expect(calls).toHaveLength(1);
  });

  test("reports API errors without retrying publish", async () => {
    const { calls, client } = fixture([{}, { uploadState: "SUCCEEDED" }, Response.json({ error: { message: "Permission denied" } }, { status: 403 })]);
    await expect(client.submit(zip, "1")).rejects.toThrow("Permission denied");
    expect(calls.filter((call) => call.url.endsWith(":publish"))).toHaveLength(1);
  });

  test("status only makes a read-only request", async () => {
    const { calls, client } = fixture([{}]);
    await client.status();
    expect(calls[0]!.init.method).toBe("GET");
    expect(calls[0]!.init.body).toBeUndefined();
  });

  test("rejects missing credentials and mismatched release tags", () => {
    expect(() => createStoreClient({ ...config, token: "" })).toThrow("Set CWS_");
    expect(() => validateVersion("1.2.3", "chrome-v1.2.4")).toThrow("does not match");
    for (const version of ["", "0", "01.2", "1.2.3.4.5", "65536", "1.2-beta"]) expect(() => validateVersion(version)).toThrow("Invalid");
    validateVersion("1.2.3", "chrome-v1.2.3");
  });
});
