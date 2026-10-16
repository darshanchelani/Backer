import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { capabilities, env } from "../env";

export type SentimentLabel = "POSITIVE" | "NEUTRAL" | "CONCERNED";

export interface SentimentResult {
  sentiment: SentimentLabel;
  confidence: number;
  reason: string;
  source: "ai" | "keywords";
}

const POSITIVE_WORDS = [
  "congrats",
  "congratulations",
  "great",
  "awesome",
  "excellent",
  "impressive",
  "exciting",
  "love",
  "amazing",
  "well done",
  "fantastic",
  "proud",
  "nice work",
  "strong",
  "momentum",
  "bullish",
  "kudos",
];

const CONCERNED_WORDS = [
  "worried",
  "worry",
  "concerned",
  "concern",
  "unclear",
  "confused",
  "not sure",
  "problem",
  "risk",
  "risky",
  "slowdown",
  "slow down",
  "decline",
  "declining",
  "down",
  "churn",
  "burn",
  "runway",
  "cut",
  "cutting",
  "layoff",
  "layoffs",
  "struggle",
  "struggling",
  "missed",
  "behind",
  "disappointed",
  "hmm",
  "why is",
  "what happened",
  "worse",
];

export function keywordSentiment(body: string): SentimentResult {
  const lower = body.toLowerCase();
  let score = 0;
  for (const w of POSITIVE_WORDS) if (lower.includes(w)) score += 1;
  for (const w of CONCERNED_WORDS) if (lower.includes(w)) score -= 1;

  const sentiment: SentimentLabel = score > 0 ? "POSITIVE" : score < 0 ? "CONCERNED" : "NEUTRAL";
  return {
    sentiment,
    confidence: 0.4,
    reason:
      sentiment === "POSITIVE"
        ? "Positive language detected."
        : sentiment === "CONCERNED"
          ? "Language suggests questions or worry."
          : "No strong signal either way.",
    source: "keywords",
  };
}

const SYSTEM = `You classify replies investors send to a startup founder's monthly update. The founder wants to know, at a glance: is this investor happy, neutral, or concerned/worried?

- POSITIVE: praise, congratulations, enthusiasm, offers of help.
- CONCERNED: worry about metrics/runway/churn, critical questions, disappointment, requests for a call to discuss problems.
- NEUTRAL: logistics, simple acknowledgements, neutral questions, intros without opinion.

Judge the actual sentiment, not surface politeness. A polite "thanks, quick question - is burn up 30%?" is CONCERNED.`;

/**
 * AI-first sentiment with a keyword fallback so replies are never left
 * unclassified when the model is unavailable.
 */
export async function classifyReply(body: string): Promise<SentimentResult> {
  const trimmed = body.trim();
  if (capabilities.ai && trimmed.length >= 3) {
    try {
      const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
      const { object } = await generateObject({
        model: openai(env.OPENAI_MODEL_DRAFT),
        schema: z.object({
          sentiment: z.enum(["POSITIVE", "NEUTRAL", "CONCERNED"]),
          confidence: z.number().min(0).max(1),
          reason: z.string().max(200).describe("One short sentence explaining the call"),
        }),
        system: SYSTEM,
        prompt: `Investor reply:\n\n${trimmed.slice(0, 4000)}`,
        temperature: 0,
      });
      return { ...object, source: "ai" };
    } catch (err) {
      console.error("[sentiment] AI classification failed, using keywords:", err);
    }
  }
  return keywordSentiment(trimmed);
}
