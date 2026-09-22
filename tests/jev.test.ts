import { describe, expect, test } from "bun:test";
import { rankChannelsWithKey } from "../src/jev";
import type { Channel, PageContext } from "../src/domain";

const context: PageContext = { url: "https://example.com", title: "Example", description: "", excerpt: "", selectedText: "" };

function channel(id: number): Channel {
  return { id, slug: `channel-${id}`, title: `Channel ${id}`, description: "", visibility: "private" };
}

describe("Jev channel ranking", () => {
  test("ranks a full list larger than the old 50-channel cap", async () => {
    const channels = Array.from({ length: 60 }, (_, index) => channel(index + 1));
    const ranking = await rankChannelsWithKey("test-key", context, channels, async (_url, init) => {
      const body: unknown = JSON.parse(String(init?.body));
      if (!body || typeof body !== "object" || !("questions" in body)) throw new Error("missing questions");
      const criteria = Object.fromEntries(channels.map(({ id }) => [`channel_${id}`, id === 60 ? 0.8 : 0.2 / 59]));
      return Response.json({ answers: { home: { choice: "channel_60", probabilities: criteria } } });
    });

    expect(ranking?.orderedIds).toHaveLength(60);
    expect(ranking?.orderedIds[0]).toBe(60);
  });

  test("uses a finalist pass when the catalog exceeds Jev's 255-choice limit", async () => {
    const channels = Array.from({ length: 300 }, (_, index) => channel(index + 1));
    let calls = 0;
    const ranking = await rankChannelsWithKey("test-key", context, channels, async (_url, init) => {
      calls += 1;
      const body: unknown = JSON.parse(String(init?.body));
      if (!body || typeof body !== "object" || !("questions" in body)) throw new Error("missing questions");
      const questions = body.questions;
      if (!questions || typeof questions !== "object" || !("home" in questions)) throw new Error("missing home question");
      const home = questions.home;
      if (!home || typeof home !== "object" || !("criteria" in home) || !home.criteria || typeof home.criteria !== "object") throw new Error("missing criteria");
      const keys = Object.keys(home.criteria);
      const winner = keys.reduce((best, key) => Number(key.slice("channel_".length)) > Number(best.slice("channel_".length)) ? key : best);
      const probabilities = Object.fromEntries(keys.map((key) => [key, key === winner ? 0.8 : 0.2 / Math.max(1, keys.length - 1)]));
      return Response.json({ answers: { home: { choice: winner, probabilities } } });
    });

    expect(calls).toBe(3);
    expect(ranking?.orderedIds).toHaveLength(300);
    expect(ranking?.orderedIds[0]).toBe(300);
  });
});
