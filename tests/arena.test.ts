import { describe, expect, test } from "bun:test";
import { arenaErrorMessage, blockBody, channelCreationBody, createChannel, listUserChannels } from "../src/arena";

describe("Are.na errors", () => {
  test("never exposes an HTML gateway response", async () => {
    const response = new Response("<!doctype html><title>504 Gateway time-out</title>", {
      status: 504,
      headers: { "content-type": "text/html" },
    });

    const message = await arenaErrorMessage(response);

    expect(message).toBe("Are.na is temporarily unavailable. Try again.");
    expect(message).not.toContain("<!doctype");
  });

  test("keeps a short JSON API message", async () => {
    const response = Response.json({ message: "This channel is read-only." }, { status: 403 });
    expect(await arenaErrorMessage(response)).toBe("This channel is read-only.");
  });
});

describe("Are.na channel listing", () => {
  test("loads every channel page at the documented page size", async () => {
    const paths: string[] = [];
    const channels = await listUserChannels(42, "", async (path) => {
      paths.push(path);
      return path.includes("page=1")
        ? Response.json({ data: [{ id: 7, slug: "reading", title: "Reading", visibility: "private" }], meta: { current_page: 1, total_pages: 2 } })
        : Response.json({ data: [{ id: 8, slug: "watching", title: "Watching", visibility: "closed" }], meta: { current_page: 2, total_pages: 2 } });
    });

    expect(paths).toEqual([
      "/v3/users/42/contents?type=Channel&page=1&per=100",
      "/v3/users/42/contents?type=Channel&page=2&per=100",
    ]);
    expect(channels.map(({ id }) => id)).toEqual([7, 8]);
  });

  test("deduplicates channels without changing Are.na order", async () => {
    const channel = { id: 7, slug: "reading", title: "Reading", visibility: "private" };
    const channels = await listUserChannels(42, "", async (path) => path.includes("page=1")
      ? Response.json({ data: [channel], meta: { current_page: 1, total_pages: 2 } })
      : Response.json({ data: [channel, { id: 8, slug: "watching", title: "Watching", visibility: "closed" }], meta: { current_page: 2, total_pages: 2 } }));

    expect(channels.map(({ id }) => id)).toEqual([7, 8]);
  });
});

describe("Are.na block creation", () => {
  test("lets Are.na resolve link metadata from the canonical URL", () => {
    expect(blockBody({
      kind: "link",
      url: "https://x.com/arena/status/123",
    }, [7])).toEqual({
      value: "https://x.com/arena/status/123",
      channels: [{ id: 7 }],
    });
  });
});

describe("Are.na channel creation", () => {
  test("creates the chosen visibility and remembers the parsed channel", async () => {
    const requests: Array<{ path: string; init: RequestInit | undefined }> = [];
    const remembered: unknown[] = [];
    const channel = await createChannel("  Shared references  ", "public", {
      request: async (path, init) => {
        requests.push({ path, init });
        return Response.json({ id: 12, slug: "shared-references", title: "Shared references", visibility: "public" }, { status: 201 });
      },
      remember: async (value) => { remembered.push(value); },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe("/v3/channels");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ title: "Shared references", visibility: "public" });
    expect(channel).toEqual({ id: 12, slug: "shared-references", title: "Shared references", description: "", visibility: "public" });
    expect(remembered).toEqual([channel]);
  });

  test("uses the exact v3 channel creation body", () => {
    expect(channelCreationBody("  Research  ", "closed")).toEqual({ title: "Research", visibility: "closed" });
  });
});
