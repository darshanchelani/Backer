import { z } from "zod";
import { conflict, handleApi, notFound, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { captureEvent } from "@/lib/analytics";
import { generateDraft } from "@/lib/ai/drafter";

const bodySchema = z.object({
  tone: z.enum(["MATTER_OF_FACT", "HYPE", "CAUTIOUS"]).optional(),
  notes: z.string().trim().max(4000).optional(),
});

/**
 * The drafting wedge: one call turns metrics + voice samples + notes
 * into a complete 4-section update. Falls back to a template draft when
 * OPENAI_API_KEY isn't configured - the loop never breaks.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { user, company } = await requireApiCompany();
    const { id } = await params;
    const body = await parseJson(request, bodySchema);

    const update = await prisma.update.findFirst({ where: { id, companyId: company.id } });
    if (!update) throw notFound("Update not found.");
    if (update.status === "SENT" || update.status === "SENDING") {
      throw conflict("This update has already been sent - start a new one instead.");
    }

    const tone = body.tone ?? update.tone;
    const result = await generateDraft({
      company,
      tone,
      periodStart: update.periodStart,
      periodEnd: update.periodEnd,
      notes: body.notes,
    });

    const promptMeta = {
      ai: result.ai,
      model: result.model,
      notes: body.notes ?? null,
      voiceSamplesUsed: result.voiceSamplesUsed,
      metrics: result.metricsUsed.map((m) => ({
        metric: m.metric,
        label: m.label,
        formatted: m.formatted,
        provider: m.provider,
      })),
    };

    const version = await prisma.$transaction(async (tx) => {
      const next = update.currentVersion + 1;
      await tx.updateVersion.create({
        data: {
          updateId: update.id,
          version: next,
          content: result.content,
          source: "AI_DRAFT",
          tone,
          model: result.model,
          promptMeta,
          createdBy: user.clerkId,
        },
      });
      await tx.update.update({
        where: { id: update.id },
        data: {
          subject: result.subject,
          tone,
          currentVersion: next,
          metricsContext: {
            period: {
              start: update.periodStart.toISOString(),
              end: update.periodEnd.toISOString(),
            },
            ...promptMeta,
          },
        },
      });
      return next;
    });

    await captureEvent("draft_generated", user.clerkId, {
      company_id: company.id,
      update_id: update.id,
      ai: result.ai,
      model: result.model,
      metrics_used: result.metricsUsed.length,
      voice_samples_used: result.voiceSamplesUsed,
      has_notes: Boolean(body.notes),
    });

    return ok({
      version,
      subject: result.subject,
      content: result.content,
      ai: result.ai,
      model: result.model,
      metricsUsed: result.metricsUsed.map((m) => ({ label: m.label, formatted: m.formatted, provider: m.provider })),
      voiceSamplesUsed: result.voiceSamplesUsed,
    });
  });
}
