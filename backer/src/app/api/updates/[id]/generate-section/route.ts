import { z } from "zod";
import { conflict, handleApi, notFound, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateSection } from "@/lib/ai/drafter";
import { emptyContent, parseContent, type UpdateContent } from "@/lib/update-content";

const bodySchema = z.object({
  section: z.enum(["wins", "metrics", "asks", "whatsNext"]),
  tone: z.enum(["MATTER_OF_FACT", "HYPE", "CAUTIOUS"]).optional(),
  instruction: z.string().trim().max(500).optional(),
});

/** Regenerate a single section, keeping the other three exactly as-is. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { user, company } = await requireApiCompany();
    const { id } = await params;
    const body = await parseJson(request, bodySchema);

    const update = await prisma.update.findFirst({
      where: { id, companyId: company.id },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!update) throw notFound("Update not found.");
    if (update.status === "SENT" || update.status === "SENDING") {
      throw conflict("This update has already been sent - start a new one instead.");
    }

    const currentContent: UpdateContent = update.versions[0]
      ? parseContent(update.versions[0].content)
      : emptyContent();

    const tone = body.tone ?? update.tone;
    const result = await generateSection({
      company,
      tone,
      periodStart: update.periodStart,
      periodEnd: update.periodEnd,
      section: body.section,
      currentContent,
      instruction: body.instruction,
    });

    const merged: UpdateContent = { ...currentContent, [body.section]: result.html };

    const version = await prisma.$transaction(async (tx) => {
      const next = update.currentVersion + 1;
      await tx.updateVersion.create({
        data: {
          updateId: update.id,
          version: next,
          content: merged,
          source: "AI_REGENERATED",
          tone,
          model: result.model,
          promptMeta: { ai: result.ai, section: body.section, instruction: body.instruction ?? null },
          createdBy: user.clerkId,
        },
      });
      await tx.update.update({
        where: { id: update.id },
        data: { currentVersion: next, tone },
      });
      return next;
    });

    return ok({ version, content: merged, ai: result.ai, model: result.model });
  });
}
