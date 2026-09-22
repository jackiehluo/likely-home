import { describe, expect, test } from "bun:test";
import type { Channel } from "../src/domain";
import { optionKey, orderChannels } from "../src/ranking";

const channels: readonly Channel[] = [
  { id: 1, slug: "one", title: "Architecture", description: "Buildings", visibility: "public" },
  { id: 2, slug: "two", title: "Writing", description: "Essays", visibility: "private" },
  { id: 3, slug: "three", title: "Interfaces", description: "UI references", visibility: "closed" },
];

describe("orderChannels", () => {
  test("sorts by probability and marks a confident suggestion", () => {
    const result = orderChannels(channels, new Map([
      [optionKey(1), 0.12],
      [optionKey(2), 0.71],
      [optionKey(3), 0.17],
    ]));
    expect(result).toEqual({ orderedIds: [2, 3, 1], suggestedIds: [2] });
  });

  test("preserves Are.na order when confidence is weak", () => {
    const result = orderChannels(channels, new Map([
      [optionKey(1), 0.34],
      [optionKey(2), 0.33],
      [optionKey(3), 0.33],
    ]));
    expect(result).toEqual({ orderedIds: [1, 2, 3], suggestedIds: [] });
  });

  test("rejects incomplete probabilities", () => {
    const result = orderChannels(channels, new Map([
      [optionKey(1), 0.5],
      [optionKey(2), 0.5],
    ]));
    expect(result).toBeNull();
  });
});
