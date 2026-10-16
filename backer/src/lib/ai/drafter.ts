import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { Company, MetricKind, Tone } from "@prisma/client";
import { prisma } from "../db";
import { capabilities, env } from "../env";
import { periodLabel } from "../format";
import {
  SECTION_KEYS,
  SECTION_LABELS,
  textToSectionHtml,
  htmlToPlainText,
  type SectionKey,
  type UpdateContent,
} from "../update-content";
import { getLatestMetrics, type DraftMetricPoint } from "./metrics-context";
import {
  buildDraftPrompt,
  buildSectionPrompt,
  DRAFT_SYSTEM,
  SECTION_SYSTEM,
} from "./prompts";

export interface DraftResult {
  subject: string;
  content: UpdateContent;
  ai: boolean;
  model: string | null;
  metricsUsed: DraftMetricPoint[];
  voiceSamplesUsed: number;
  notes?: string;
}

export interface SectionResult {
  html: string;
  ai: boolean;
  model: string | null;
}

const VOICE_SAMPLE_LIMIT = 3;
const VOICE_SAMPLE_MAX_CHARS = 1400;

async function loadVoiceSamples(companyId: string): Promise<string[]> {
  const samples = await prisma.voiceSample.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: VOICE_SAMPLE_LIMIT,
    select: { content: true },
  });
  return samples.map((s) => s.content.slice(0, VOICE_SAMPLE_MAX_CHARS));
}

const draftSchema = z.object({
  subject: z.string().describe("Short subject line, format: '<CompanyName> - <Month> update'"),
  wins: z.string().describe("Plain text, 2-4 sentences, paragraphs separated by blank lines"),
  metrics: z.string().describe("Plain text, one 'Label: value' per line, no blank lines"),
  asks: z.string().describe("Plain text, each ask on its own line starting with '- '"),
  whatsNext: z.string().describe("Plain text, one short paragraph"),
});

const sectionSchema = z.object({
  text: z.string().describe("The rewritten section, plain text only"),
});

function openaiModel() {
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  return openai(env.OPENAI_MODEL_DRAFT);
}

/**
 * Generate a full 4-section draft. Uses GPT when OPENAI_API_KEY is set;
 * otherwise (or on any AI failure) falls back to a structured template so
 * the product loop always works end to end.
 */
export async function generateDraft(opts: {
  company: Company;
  tone: Tone;
  periodStart: Date;
  periodEnd: Date;
  notes?: string;
}): Promise<DraftResult> {
  const { company, tone, periodStart, periodEnd } = opts;
  const period = periodLabel(periodStart, periodEnd);
  const metrics = await getLatestMetrics(company.id);
  const voiceSamples = await loadVoiceSamples(company.id);

  if (capabilities.ai) {
    try {
      const { object } = await generateObject({
        model: openaiModel(),
        schema: draftSchema,
        system: DRAFT_SYSTEM,
        temperature: 0.6,
        prompt: buildDraftPrompt({
          companyName: company.name,
          stage: company.stage,
          periodLabel: period,
          tone,
          metrics,
          voiceSamples,
          notes: opts.notes,
        }),
      });

      return {
        subject: object.subject.trim() || defaultSubject(company.name, period),
        content: {
          wins: textToSectionHtml("wins", object.wins),
          metrics: textToSectionHtml("metrics", object.metrics),
          asks: textToSectionHtml("asks", object.asks),
          whatsNext: textToSectionHtml("whatsNext", object.whatsNext),
        },
        ai: true,
        model: env.OPENAI_MODEL_DRAFT,
        metricsUsed: metrics,
        voiceSamplesUsed: voiceSamples.length,
        notes: opts.notes,
      };
    } catch (err) {
      console.error("[drafter] AI draft failed, falling back to template:", err);
    }
  }

  return templateDraft({ company, period, tone, metrics, voiceSamplesUsed: voiceSamples.length, notes: opts.notes });
}

/**
 * Regenerate a single section in place. Without AI, re-renders the section
 * from the template (metrics = fresh numbers; others = honest placeholders).
 */
export async function generateSection(opts: {
  company: Company;
  tone: Tone;
  periodStart: Date;
  periodEnd: Date;
  section: SectionKey;
  currentContent: UpdateContent;
  notes?: string;
  instruction?: string;
}): Promise<SectionResult> {
  const { company, tone, section, currentContent } = opts;
  const period = periodLabel(opts.periodStart, opts.periodEnd);
  const metrics = await getLatestMetrics(company.id);

  if (capabilities.ai) {
    try {
      const { object } = await generateObject({
        model: openaiModel(),
        schema: sectionSchema,
        system: SECTION_SYSTEM,
        temperature: 0.7,
        prompt: buildSectionPrompt({
          companyName: company.name,
          periodLabel: period,
          tone,
          section,
          currentSectionText: htmlToPlainText(currentContent[section]),
          otherSections: SECTION_KEYS.filter((k) => k !== section).map((k) => ({
            label: SECTION_LABELS[k],
            text: htmlToPlainText(currentContent[k]),
          })),
          metrics,
          notes: opts.notes,
          instruction: opts.instruction,
        }),
      });

      return {
        html: textToSectionHtml(section, object.text),
        ai: true,
        model: env.OPENAI_MODEL_DRAFT,
      };
    } catch (err) {
      console.error("[drafter] AI section rewrite failed, falling back to template:", err);
    }
  }

  return { html: templateSection(section, metrics), ai: false, model: null };
}

function defaultSubject(companyName: string, period: string): string {
  return `${companyName} - ${period} update`;
}

function templateDraft(opts: {
  company: Company;
  period: string;
  tone: Tone;
  metrics: DraftMetricPoint[];
  voiceSamplesUsed: number;
  notes?: string;
}): DraftResult {
  const { company, period, metrics, notes } = opts;

  const wins = notes?.trim()
    ? textToSectionHtml("wins", notes)
    : `<p>We&apos;re heads-down building - nothing major to announce this month, and the numbers below are the clearest signal of progress.</p>`;

  return {
    subject: defaultSubject(company.name, period),
    content: {
      wins,
      metrics: templateSection("metrics", metrics),
      asks: templateSection("asks", metrics),
      whatsNext: templateSection("whatsNext", metrics),
    },
    ai: false,
    model: null,
    metricsUsed: metrics,
    voiceSamplesUsed: opts.voiceSamplesUsed,
    notes,
  };
}

function templateSection(section: SectionKey, metrics: DraftMetricPoint[]): string {
  switch (section) {
    case "wins":
      return `<p>We&apos;re heads-down building - nothing major to announce this month, and the numbers below are the clearest signal of progress.</p>`;
    case "metrics": {
      if (metrics.length === 0) {
        return `<p>We don&apos;t have connected numbers yet - they land here in the next update.</p>`;
      }
      return textToSectionHtml("metrics", templateMetricLines(metrics).join("\n"));
    }
    case "asks":
      return `<ul><li>Warm intros to potential customers or partners in our space.</li><li>If you know great engineers who&apos;d love what we&apos;re building, send them our way.</li></ul>`;
    case "whatsNext":
      return `<p>We&apos;ll keep the focus on shipping and growth - expect the next update with fresh numbers next month.</p>`;
  }
}

/** Template drafts show the 7 most important metrics, not a wall of numbers. */
const TEMPLATE_METRIC_PRIORITY: MetricKind[] = [
  "MRR",
  "NEW_CUSTOMERS",
  "CHURNED_CUSTOMERS",
  "ACTIVE_USERS",
  "PIPELINE_VALUE",
  "DEALS_WON",
  "RUNWAY_MONTHS",
  "REVENUE",
  "CASH_ON_HAND",
  "BURN",
  "NEW_SIGNUPS",
  "DEALS_OPEN",
  "REFUNDS",
  "EVENTS_TRACKED",
];

function templateMetricLines(metrics: DraftMetricPoint[]): string[] {
  const remaining = new Map(metrics.map((m) => [m.metric, m]));
  const picked: DraftMetricPoint[] = [];
  for (const kind of TEMPLATE_METRIC_PRIORITY) {
    const point = remaining.get(kind);
    if (point) {
      picked.push(point);
      remaining.delete(kind);
    }
    if (picked.length >= 7) break;
  }
  if (picked.length < 4) {
    for (const point of remaining.values()) {
      picked.push(point);
      if (picked.length >= 4) break;
    }
  }
  return picked.map((m) => `${m.label}: ${m.formatted}`);
}
