import { z } from "zod";
import type { CaptureTarget, Channel, ChannelVisibility } from "./domain";
import { handleUnauthorized } from "./auth";
import { addChannelToCache, getArenaToken, getChannelCache, setChannelCache } from "./settings";

const CHANNEL_PAGE_SIZE = 100;
const CHANNEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const Markdown = z.union([
  z.string(),
  z.object({ plain: z.string().optional(), markdown: z.string().optional() }).passthrough(),
  z.null(),
]).optional();

const ChannelWire = z.object({
  id: z.number(),
  slug: z.string(),
  title: z.string(),
  visibility: z.enum(["public", "private", "closed"]).optional(),
  status: z.enum(["public", "private", "closed"]).optional(),
  description: Markdown,
  can: z.object({ add_to: z.boolean().optional() }).passthrough().optional(),
}).passthrough();

const MeWire = z.object({ id: z.number(), slug: z.string() }).passthrough();
const BlockWire = z.object({ id: z.number() }).passthrough();
const ChannelPageWire = z.object({
  data: z.array(z.unknown()),
  meta: z.object({
    current_page: z.number().int().positive(),
    total_pages: z.number().int().nonnegative(),
  }),
}).passthrough();

async function arenaFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getArenaToken();
  if (!token) throw new Error("Sign in to Are.na first.");
  const response = await fetch(`https://api.are.na${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 401) return handleUnauthorized();
  if (!response.ok) {
    throw new Error(await arenaErrorMessage(response));
  }
  return response;
}

export async function arenaErrorMessage(response: Response): Promise<string> {
  if ([502, 503, 504].includes(response.status)) {
    return "Are.na is temporarily unavailable. Try again.";
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body: unknown = await response.json().catch(() => null);
    if (body && typeof body === "object") {
      const value = "message" in body ? body.message : "error" in body ? body.error : null;
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 180);
    }
  }

  return `Are.na request failed (${response.status}). Try again.`;
}

function plainDescription(value: z.infer<typeof Markdown>): string {
  if (typeof value === "string") return value;
  if (!value) return "";
  return value.plain ?? value.markdown ?? "";
}

function parseChannel(input: unknown): Channel | null {
  const result = ChannelWire.safeParse(input);
  if (!result.success || result.data.can?.add_to === false) return null;
  return {
    id: result.data.id,
    slug: result.data.slug,
    title: result.data.title,
    description: plainDescription(result.data.description),
    visibility: result.data.visibility ?? result.data.status ?? "public",
  };
}

type CreateChannelDependencies = Readonly<{
  request(path: string, init?: RequestInit): Promise<Response>;
  remember(channel: Channel): Promise<void>;
}>;

export function channelCreationBody(title: string, visibility: ChannelVisibility): object {
  return { title: title.trim(), visibility };
}

export async function createChannel(
  title: string,
  visibility: ChannelVisibility,
  dependencies: CreateChannelDependencies = { request: arenaFetch, remember: addChannelToCache },
): Promise<Channel> {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) throw new Error("Enter a channel name.");
  const response = await dependencies.request("/v3/channels", {
    method: "POST",
    body: JSON.stringify(channelCreationBody(normalizedTitle, visibility)),
  });
  const channel = parseChannel(await response.json());
  if (!channel) throw new Error("Are.na returned an invalid channel.");
  await dependencies.remember(channel);
  return channel;
}

export async function listChannels(query: string): Promise<readonly Channel[]> {
  const cached = await getChannelCache();
  if (cached) {
    if (Date.now() - cached.fetchedAt >= CHANNEL_CACHE_TTL_MS) void refreshChannelCache().catch(() => undefined);
    return filterChannels(cached.channels, query);
  }
  return filterChannels(await refreshChannelCache(), query);
}

type ArenaRequest = (path: string) => Promise<Response>;
let refreshInFlight: Promise<readonly Channel[]> | null = null;

function refreshChannelCache(): Promise<readonly Channel[]> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const me = MeWire.parse(await (await arenaFetch("/v3/me")).json());
    const channels = await listUserChannels(me.id, "", arenaFetch);
    await setChannelCache(channels);
    return channels;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function filterChannels(channels: readonly Channel[], query: string): readonly Channel[] {
  const needle = query.trim().toLocaleLowerCase();
  return needle ? channels.filter(({ title, description }) => `${title} ${description}`.toLocaleLowerCase().includes(needle)) : channels;
}

export async function listUserChannels(userId: number, query: string, request: ArenaRequest): Promise<readonly Channel[]> {
  const channels = new Map<number, Channel>();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({ type: "Channel", page: String(page), per: String(CHANNEL_PAGE_SIZE) });
    const body: unknown = await (await request(`/v3/users/${userId}/contents?${params}`)).json();
    const parsed = parseChannelPage(body);
    for (const item of parsed.collection) {
      const channel = parseChannel(item);
      if (channel && !channels.has(channel.id)) channels.set(channel.id, channel);
    }
    hasMore = page < parsed.totalPages;
    page += 1;
  }

  return filterChannels([...channels.values()], query);
}

function parseChannelPage(input: unknown): Readonly<{ collection: readonly unknown[]; totalPages: number }> {
  const result = ChannelPageWire.safeParse(input);
  if (!result.success) throw new Error("Are.na returned an invalid channel list.");
  return {
    collection: result.data.data,
    totalPages: result.data.meta.total_pages,
  };
}

export function blockBody(target: Exclude<CaptureTarget, { kind: "arena-block" | "arena-channel" }>, channelIds: readonly number[]): object {
  switch (target.kind) {
    case "link":
      return { value: target.url, channels: channelIds.map((id) => ({ id })) };
    case "text":
      return { value: target.text, title: target.sourceTitle, original_source_url: target.sourceUrl, original_source_title: target.sourceTitle, channels: channelIds.map((id) => ({ id })) };
    case "image":
      return { value: target.imageUrl, original_source_url: target.sourceUrl, original_source_title: target.sourceTitle, channels: channelIds.map((id) => ({ id })) };
    default: {
      const exhaustive: never = target;
      return exhaustive;
    }
  }
}

export async function connect(target: CaptureTarget, channelIds: readonly number[]): Promise<string> {
  if (channelIds.length === 0) throw new Error("Choose at least one channel.");
  if (channelIds.length > 20) throw new Error("Are.na accepts up to 20 channels at once.");

  if (target.kind === "arena-block") {
    await arenaFetch("/v3/connections", { method: "POST", body: JSON.stringify({ connectable_id: target.blockId, connectable_type: "Block", channels: channelIds.map((id) => ({ id })) }) });
    return target.sourceUrl;
  }
  if (target.kind === "arena-channel") {
    const channel = ChannelWire.parse(await (await arenaFetch(`/v3/channels/${encodeURIComponent(target.slug)}`)).json());
    await arenaFetch("/v3/connections", { method: "POST", body: JSON.stringify({ connectable_id: channel.id, connectable_type: "Channel", channels: channelIds.map((id) => ({ id })) }) });
    return target.sourceUrl;
  }
  const block = BlockWire.parse(await (await arenaFetch("/v3/blocks", { method: "POST", body: JSON.stringify(blockBody(target, channelIds)) })).json());
  return `https://www.are.na/block/${block.id}`;
}
