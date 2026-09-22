import { z } from "zod";
import type { Channel, PageContext, Ranking } from "./domain";
import { optionKey, orderChannels, RANKING_POLICY } from "./ranking";
import { getSettings } from "./settings";

const ChoiceAnswer = z.object({
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
}).passthrough();
const JevResponse = z.object({ answers: z.object({ home: ChoiceAnswer }).passthrough() }).passthrough();

export async function rankChannels(context: PageContext, input: readonly Channel[]): Promise<Ranking | null> {
  const { jevApiKey } = await getSettings();
  if (!jevApiKey) return null;
  return rankChannelsWithKey(jevApiKey, context, input, fetch);
}

type JevRequest = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

async function askJev(apiKey: string, context: PageContext, channels: readonly Channel[], request: JevRequest): Promise<ReadonlyMap<string, number> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  try {
    const criteria = Object.fromEntries(channels.map((channel) => [
      optionKey(channel.id),
      `${channel.title}${channel.description ? ` — ${channel.description.slice(0, 280)}` : ""}`,
    ]));
    const response = await request("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "jev-latest",
        state: {
          page: {
            url: context.url,
            title: context.title,
            description: context.description,
            selected_text: context.selectedText,
            excerpt: context.excerpt,
          },
        },
        questions: {
          home: {
            type: "choice",
            instructions: "Which Are.na channel is the most fitting home for this page or selection? Prefer the channel whose topic and intent most specifically match.",
            criteria,
          },
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const answer = JevResponse.parse(await response.json()).answers.home;
    return new Map(Object.entries(answer.probabilities));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function rankChannelsWithKey(apiKey: string, context: PageContext, channels: readonly Channel[], request: JevRequest): Promise<Ranking | null> {
  if (channels.length < 2) return { orderedIds: channels.map(({ id }) => id), suggestedIds: channels.map(({ id }) => id) };
  if (channels.length <= RANKING_POLICY.maxCandidates) {
    const probabilities = await askJev(apiKey, context, channels, request);
    return probabilities ? orderChannels(channels, probabilities) : null;
  }

  const batches = Array.from(
    { length: Math.ceil(channels.length / RANKING_POLICY.maxCandidates) },
    (_, index) => channels.slice(index * RANKING_POLICY.maxCandidates, (index + 1) * RANKING_POLICY.maxCandidates),
  );
  const batchProbabilities = await Promise.all(batches.map((batch) => askJev(apiKey, context, batch, request)));
  if (batchProbabilities.some((probabilities) => probabilities === null)) return null;

  const finalists = batches.flatMap((batch, index) => {
    const probabilities = batchProbabilities[index];
    if (!probabilities) return [];
    return [...batch]
      .sort((left, right) => (probabilities.get(optionKey(right.id)) ?? 0) - (probabilities.get(optionKey(left.id)) ?? 0))
      .slice(0, RANKING_POLICY.batchFinalists);
  });
  const finalProbabilities = await askJev(apiKey, context, finalists, request);
  if (!finalProbabilities) return null;
  const finalRanking = orderChannels(finalists, finalProbabilities);
  if (!finalRanking) return null;
  const finalistIds = new Set(finalRanking.orderedIds);
  return {
    orderedIds: [...finalRanking.orderedIds, ...channels.filter(({ id }) => !finalistIds.has(id)).map(({ id }) => id)],
    suggestedIds: finalRanking.suggestedIds,
  };
}
