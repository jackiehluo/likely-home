import { browser } from "wxt/browser";
import { z } from "zod";
import type { Channel, Settings } from "./domain";

const DEFAULTS: Settings = {
  jevApiKey: "",
};
const CHANNEL_CACHE_KEY = "arenaChannelCache";
const ChannelCacheWire = z.object({
  fetchedAt: z.number().int().nonnegative(),
  channels: z.array(z.object({
    id: z.number(),
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    visibility: z.enum(["public", "private", "closed"]),
  })),
});

export type ChannelCache = Readonly<{ fetchedAt: number; channels: readonly Channel[] }>;

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get("jevApiKey");
  return {
    jevApiKey: typeof stored.jevApiKey === "string" ? stored.jevApiKey : DEFAULTS.jevApiKey,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ jevApiKey: settings.jevApiKey.trim() });
  await browser.storage.local.remove("arenaClientId");
}

export async function completeJevSetup(jevApiKey: string): Promise<void> {
  const normalized = jevApiKey.trim();
  if (!normalized) throw new Error("Enter a Jev API key.");
  await browser.storage.local.set({ jevApiKey: normalized });
}

export async function getArenaToken(): Promise<string | null> {
  const stored = await browser.storage.local.get("arenaAccessToken");
  return typeof stored.arenaAccessToken === "string" ? stored.arenaAccessToken : null;
}

export async function setArenaToken(token: string): Promise<void> {
  await browser.storage.local.set({ arenaAccessToken: token });
}

export async function clearArenaToken(): Promise<void> {
  await browser.storage.local.remove(["arenaAccessToken", CHANNEL_CACHE_KEY]);
}

export async function getChannelCache(): Promise<ChannelCache | null> {
  const stored = await browser.storage.local.get(CHANNEL_CACHE_KEY);
  const result = ChannelCacheWire.safeParse(stored[CHANNEL_CACHE_KEY]);
  return result.success ? result.data : null;
}

export async function setChannelCache(channels: readonly Channel[], fetchedAt = Date.now()): Promise<void> {
  await browser.storage.local.set({ [CHANNEL_CACHE_KEY]: { fetchedAt, channels } });
}

export async function addChannelToCache(channel: Channel): Promise<void> {
  const cached = await getChannelCache();
  if (!cached) return;
  await setChannelCache(
    [channel, ...cached.channels.filter(({ id }) => id !== channel.id)],
    cached.fetchedAt,
  );
}
