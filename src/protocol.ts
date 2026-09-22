import type { CaptureTarget, Channel, ChannelVisibility, PageContext, Ranking, Settings } from "./domain";

export type Request =
  | { type: "get-status" }
  | { type: "authorize" }
  | { type: "open-options" }
  | { type: "open-jev-help" }
  | { type: "get-settings" }
  | { type: "save-settings"; settings: Settings }
  | { type: "complete-jev-setup"; jevApiKey: string }
  | { type: "list-channels"; query: string }
  | { type: "create-channel"; title: string; visibility: ChannelVisibility }
  | { type: "rank-channels"; context: PageContext; channels: readonly Channel[] }
  | { type: "connect"; target: CaptureTarget; channelIds: readonly number[] };

export type Response =
  | { ok: true; type: "status"; arenaConnected: boolean; jevConfigured: boolean }
  | { ok: true; type: "authorized" }
  | { ok: true; type: "options-opened" }
  | { ok: true; type: "jev-help-opened" }
  | { ok: true; type: "settings"; settings: Settings }
  | { ok: true; type: "saved" }
  | { ok: true; type: "jev-setup-complete" }
  | { ok: true; type: "channels"; channels: readonly Channel[] }
  | { ok: true; type: "channel-created"; channel: Channel }
  | { ok: true; type: "ranking"; ranking: Ranking | null }
  | { ok: true; type: "connected"; href: string }
  | { ok: false; message: string };

export type OpenOverlayMessage = {
  type: "open-overlay";
  source: "page" | "selection" | "image";
  selectionText?: string;
  imageUrl?: string;
};
