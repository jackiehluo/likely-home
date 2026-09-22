import { describe, expect, test } from "bun:test";
import { initialCaptureState, transition, type CaptureTarget, type PageContext } from "../src/domain";

const target: CaptureTarget = { kind: "link", url: "https://example.com" };
const context: PageContext = { url: "https://example.com", title: "Example", description: "", excerpt: "", selectedText: "" };
const channel = { id: 4, slug: "four", title: "Four", description: "", visibility: "public" as const };

describe("capture transition", () => {
  test("ignores stale ranking and keeps selection through current ranking", () => {
    let state = initialCaptureState(target, context);
    state = transition(state, { type: "channels-requested", query: "", requestId: 2 });
    state = transition(state, { type: "channels-loaded", channels: [channel], requestId: 2 });
    state = transition(state, { type: "channel-toggled", channelId: 4 });
    state = transition(state, { type: "channels-ranked", ranking: { orderedIds: [99], suggestedIds: [99] }, requestId: 1 });
    expect(state.displayOrder).toEqual([4]);
    expect(state.selectedIds.has(4)).toBe(true);
  });

  test("adds a newly created channel first and selects it", () => {
    let state = initialCaptureState(target, context);
    state = transition(state, { type: "channels-requested", query: "", requestId: 1 });
    state = transition(state, { type: "channels-loaded", channels: [channel], requestId: 1 });
    const created = { id: 9, slug: "new-home", title: "New home", description: "", visibility: "closed" as const };

    state = transition(state, { type: "channel-created", channel: created });

    expect(state.displayOrder).toEqual([9, 4]);
    expect(state.channels.get(9)).toEqual(created);
    expect(state.selectedIds.has(9)).toBe(true);
  });
});
