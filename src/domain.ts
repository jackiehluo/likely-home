export type Channel = Readonly<{
  id: number;
  slug: string;
  title: string;
  description: string;
  visibility: "public" | "private" | "closed";
}>;

export type ChannelVisibility = Channel["visibility"];

export type CaptureTarget =
  | { kind: "link"; url: string }
  | { kind: "text"; text: string; sourceUrl: string; sourceTitle: string }
  | { kind: "image"; imageUrl: string; sourceUrl: string; sourceTitle: string }
  | { kind: "arena-block"; blockId: number; sourceUrl: string }
  | { kind: "arena-channel"; slug: string; sourceUrl: string };

export type PageContext = Readonly<{
  url: string;
  title: string;
  description: string;
  excerpt: string;
  selectedText: string;
}>;

export type Ranking = Readonly<{
  orderedIds: readonly number[];
  suggestedIds: readonly number[];
}>;

export type Settings = Readonly<{
  jevApiKey: string;
}>;

export type CaptureState = Readonly<{
  phase: "loading" | "ready" | "connecting" | "done";
  auth: "checking" | "required" | "connected";
  target: CaptureTarget;
  context: PageContext;
  channels: ReadonlyMap<number, Channel>;
  displayOrder: readonly number[];
  selectedIds: ReadonlySet<number>;
  suggestedIds: ReadonlySet<number>;
  query: string;
  requestId: number;
  ranking: "idle" | "pending" | "ranked" | "unavailable";
  error: string | null;
}>;

export type CaptureEvent =
  | { type: "auth-resolved"; connected: boolean }
  | { type: "channels-requested"; query: string; requestId: number }
  | { type: "channels-loaded"; channels: readonly Channel[]; requestId: number }
  | { type: "channels-ranked"; ranking: Ranking; requestId: number }
  | { type: "ranking-unavailable"; requestId: number }
  | { type: "channel-toggled"; channelId: number }
  | { type: "channel-created"; channel: Channel }
  | { type: "connect-requested" }
  | { type: "connect-succeeded" }
  | { type: "failed"; message: string };

export function initialCaptureState(target: CaptureTarget, context: PageContext): CaptureState {
  return {
    phase: "loading",
    auth: "checking",
    target,
    context,
    channels: new Map(),
    displayOrder: [],
    selectedIds: new Set(),
    suggestedIds: new Set(),
    query: "",
    requestId: 0,
    ranking: "idle",
    error: null,
  };
}

export function transition(state: CaptureState, event: CaptureEvent): CaptureState {
  switch (event.type) {
    case "auth-resolved":
      return { ...state, auth: event.connected ? "connected" : "required", phase: event.connected ? state.phase : "ready" };
    case "channels-requested":
      return { ...state, phase: "loading", query: event.query, requestId: event.requestId, ranking: "idle", error: null };
    case "channels-loaded": {
      if (event.requestId !== state.requestId) return state;
      const channels = new Map(event.channels.map((channel) => [channel.id, channel]));
      return { ...state, phase: "ready", channels, displayOrder: event.channels.map(({ id }) => id), suggestedIds: new Set(), ranking: "pending" };
    }
    case "channels-ranked":
      if (event.requestId !== state.requestId) return state;
      return { ...state, displayOrder: event.ranking.orderedIds, suggestedIds: new Set(event.ranking.suggestedIds), ranking: "ranked" };
    case "ranking-unavailable":
      return event.requestId === state.requestId ? { ...state, ranking: "unavailable" } : state;
    case "channel-toggled": {
      const selectedIds = new Set(state.selectedIds);
      selectedIds.has(event.channelId) ? selectedIds.delete(event.channelId) : selectedIds.add(event.channelId);
      return { ...state, selectedIds };
    }
    case "channel-created": {
      const channels = new Map(state.channels);
      channels.set(event.channel.id, event.channel);
      const selectedIds = new Set(state.selectedIds);
      selectedIds.add(event.channel.id);
      return {
        ...state,
        phase: "ready",
        channels,
        displayOrder: [event.channel.id, ...state.displayOrder.filter((id) => id !== event.channel.id)],
        selectedIds,
        error: null,
      };
    }
    case "connect-requested":
      return state.selectedIds.size === 0 ? state : { ...state, phase: "connecting", error: null };
    case "connect-succeeded":
      return { ...state, phase: "done" };
    case "failed":
      return { ...state, phase: "ready", error: event.message };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
