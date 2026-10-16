import type { CompanyStage, Tone } from "@prisma/client";
import { SECTION_LABELS, type SectionKey } from "../update-content";
import { STAGE_LABELS } from "../schemas";
import type { DraftMetricPoint } from "./metrics-context";

export const TONE_LABELS: Record<Tone, string> = {
  MATTER_OF_FACT: "Matter of fact",
  HYPE: "High energy",
  CAUTIOUS: "Cautious",
};

export const TONE_DESCRIPTIONS: Record<Tone, string> = {
  MATTER_OF_FACT: "Calm and specific. Confidence through numbers, not adjectives.",
  HYPE: "It was a good month - say so. Still concrete, never breathless.",
  CAUTIOUS: "Candid about headwinds first. Investors read spin as a red flag.",
};

export const TONE_GUIDE: Record<Tone, string> = {
  MATTER_OF_FACT:
    "Calm, factual, no hype. State numbers plainly. Confidence comes from specificity, not adjectives.",
  HYPE: "High-energy and optimistic - celebrate real wins. Every claim still ties to a number or a shipped thing.",
  CAUTIOUS:
    "Measured and candid. Acknowledge what didn't go to plan before the wins. No spin - investors read spin as a red flag.",
};

/**
 * The voice contract. The drafter must sound like a founder, not a
 * newsletter, and must never fabricate facts - investors will check.
 */
export const DRAFT_SYSTEM = `You ghostwrite investor updates for startup founders. The founder sends your draft as-is, so it must read like a real person wrote it: first person ("we"), plain words, short sentences.

Hard rules:
- Use ONLY facts from the context. Never invent numbers, customers, hires, launches, or events. If a section has little to say, write one honest short line instead of padding.
- Copy every number exactly as given (e.g. "$48.2K", "18 months"). Never compute new numbers.
- No greetings, no sign-offs, no "I hope this finds you well", no "thrilled/excited/humbled". No emoji.
- Plain text only. No markdown, no asterisks, no headings.

Section formats:
- wins: the most important thing first, then 1-3 more. One paragraph, or two short ones separated by a blank line. 2-4 sentences total.
- metrics: one metric per line, exactly "Label: value - optional 3-8 word takeaway". No blank lines. Use only the provided metrics.
- asks: 1-3 asks, each on its own line starting with "- ". Be specific about who or what. If there is nothing concrete to ask, output exactly one line: "- Nothing specific this month - always happy to hear where you think we can help."
- whatsNext: one short paragraph on the 2-4 things the team focuses on next period.

Also write the subject line: short, specific, no emoji, format "<CompanyName> - <Month> update".`;

export interface DraftPromptInput {
  companyName: string;
  stage: CompanyStage | null;
  periodLabel: string;
  tone: Tone;
  metrics: DraftMetricPoint[];
  voiceSamples: string[];
  notes?: string;
}

export function buildDraftPrompt(input: DraftPromptInput): string {
  const parts: string[] = [];

  parts.push(
    `Company: ${input.companyName}${input.stage ? ` (${STAGE_LABELS[input.stage]})` : ""}\nUpdate period: ${input.periodLabel}`,
  );
  parts.push(`Tone: ${TONE_LABELS[input.tone]} - ${TONE_GUIDE[input.tone]}`);

  if (input.metrics.length > 0) {
    parts.push(
      `Metrics for this period (use these exact values, do not add others):\n${input.metrics
        .map((m) => `- ${m.label}: ${m.formatted}`)
        .join("\n")}`,
    );
  } else {
    parts.push(
      "Metrics: none are connected yet. Keep the metrics section to one honest line saying numbers land in the next update.",
    );
  }

  if (input.notes && input.notes.trim()) {
    parts.push(
      `Founder notes for this period (the primary source of truth for wins and what's next - every wins bullet should come from here):\n${input.notes.trim()}`,
    );
  }

  if (input.voiceSamples.length > 0) {
    parts.push(
      `How this founder actually writes (match this voice - vocabulary, rhythm, level of detail; do not copy facts from these):\n${input.voiceSamples
        .map((s, i) => `--- sample ${i + 1} ---\n${s}`)
        .join("\n\n")}`,
    );
  }

  parts.push(`Write the ${input.periodLabel} investor update now.`);
  return parts.join("\n\n");
}

export const SECTION_SYSTEM = `You ghostwrite investor updates for startup founders. You are rewriting ONE section of an update the founder already has. Match the voice and level of detail of the other sections. Use only facts from the context. Plain text only - no markdown, no headings, no greetings.`;

const SECTION_FORMAT_HINTS: Record<SectionKey, string> = {
  wins: "most important thing first, 2-4 sentences, paragraphs separated by blank lines",
  metrics: 'one metric per line, exactly "Label: value - optional short takeaway", no blank lines',
  asks: 'each ask on its own line starting with "- "',
  whatsNext: "one short paragraph",
};

export function buildSectionPrompt(input: {
  companyName: string;
  periodLabel: string;
  tone: Tone;
  section: SectionKey;
  currentSectionText: string;
  otherSections: Array<{ label: string; text: string }>;
  metrics: DraftMetricPoint[];
  notes?: string;
  instruction?: string;
}): string {
  const parts: string[] = [];

  parts.push(`Company: ${input.companyName}\nUpdate period: ${input.periodLabel}`);
  parts.push(`Tone: ${TONE_LABELS[input.tone]} - ${TONE_GUIDE[input.tone]}`);

  if (input.metrics.length > 0) {
    parts.push(
      `Metrics (exact values, do not invent others):\n${input.metrics.map((m) => `- ${m.label}: ${m.formatted}`).join("\n")}`,
    );
  }

  if (input.notes && input.notes.trim()) {
    parts.push(`Founder notes for this period:\n${input.notes.trim()}`);
  }

  const others = input.otherSections.filter((s) => s.text.trim());
  if (others.length > 0) {
    parts.push(
      `The rest of the update, for continuity (do not repeat it):\n${others
        .map((s) => `[${s.label}]\n${s.text}`)
        .join("\n\n")}`,
    );
  }

  parts.push(`Current "${SECTION_LABELS[input.section]}" section:\n${input.currentSectionText || "(empty)"}`);

  if (input.instruction && input.instruction.trim()) {
    parts.push(`The founder wants this change: ${input.instruction.trim()}`);
  }

  parts.push(
    `Rewrite the "${SECTION_LABELS[input.section]}" section now. Same format rules as the original (${SECTION_FORMAT_HINTS[input.section]}). Return only the section text.`,
  );

  return parts.join("\n\n");
}
