import type { Channel, Ranking } from "./domain";

export const RANKING_POLICY = {
  maxCandidates: 255,
  batchFinalists: 5,
  minimumTopProbability: 0.2,
  minimumLead: 0.03,
  suggestedBand: 0.08,
  maxSuggested: 3,
} as const;

export function orderChannels(
  channels: readonly Channel[],
  probabilities: ReadonlyMap<string, number>,
): Ranking | null {
  if (channels.length === 0) return { orderedIds: [], suggestedIds: [] };
  const entries = channels.map((channel, index) => {
    const probability = probabilities.get(optionKey(channel.id));
    return probability === undefined ? null : { channel, index, probability };
  });
  if (entries.some((entry) => entry === null)) return null;
  const complete = entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  if (complete.some(({ probability }) => !Number.isFinite(probability) || probability < 0 || probability > 1)) return null;
  const ordered = [...complete].sort((a, b) => b.probability - a.probability || a.index - b.index);
  const top = ordered[0];
  if (!top) return null;
  const second = ordered[1];
  const confident = top.probability >= RANKING_POLICY.minimumTopProbability && (!second || top.probability - second.probability >= RANKING_POLICY.minimumLead);
  if (!confident) return { orderedIds: channels.map(({ id }) => id), suggestedIds: [] };
  return {
    orderedIds: ordered.map(({ channel }) => channel.id),
    suggestedIds: ordered
      .filter(({ probability }) => top.probability - probability <= RANKING_POLICY.suggestedBand)
      .slice(0, RANKING_POLICY.maxSuggested)
      .map(({ channel }) => channel.id),
  };
}

export function optionKey(channelId: number): string {
  return `channel_${channelId}`;
}
