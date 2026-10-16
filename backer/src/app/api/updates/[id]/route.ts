import { z } from "zod";
import { conflict, handleApi, notFound, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseContent, SECTION_KEYS, type UpdateContent } from "@/lib/update-content";

const contentSchema = z.object({
  wins: z.string().max(20000),
  metrics: z.string().max(20000),
  asks: z.string().max(20000),
  whatsNext: z.string().max(20000),
});

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    subject: z.string().trim().max(200).optional(),
    tone: z.enum(["MATTER_OF_FACT", "HYPE", "CAUTIOUS"]).optional(),
    content: contentSchema.optional(),
  })
  .refine((d) => d.title !== undefined || d.subject !== undefined || d.tone !== undefined || d.content !== undefined, {
    message: "Nothing to update.",
  });

/**
 * Founder edits. Every save becomes a new UpdateVersion so the history
 * (and the "what the AI originally wrote" diff) survives.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { user, company } = await requireApiCompany();
    const { id } = await params;
    const body = await parseJson(request, patchSchema);

    const update = await prisma.update.findFirst({
      where: { id, companyId: company.id },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!update) throw notFound("Update not found.");
    if (update.status === "SENT" || update.status === "SENDING") {
      throw conflict("This update has already been sent - edits would desync it from what investors received.");
    }

    let nextVersion = update.currentVersion;

    await prisma.$transaction(async (tx) => {
      if (body.content) {
        const merged: UpdateContent = { ...parseContent(update.versions[0]?.content), ...body.content };
        nextVersion = update.currentVersion + 1;
        await tx.updateVersion.create({
          data: {
            updateId: update.id,
            version: nextVersion,
            content: merged,
            source: "FOUNDER_EDIT",
            tone: body.tone ?? update.tone,
            createdBy: user.clerkId,
          },
        });
      }

      await tx.update.update({
        where: { id: update.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.subject !== undefined ? { subject: body.subject } : {}),
          ...(body.tone !== undefined ? { tone: body.tone } : {}),
          ...(body.content ? { currentVersion: nextVersion } : {}),
        },
      });
    });

    return ok({ version: nextVersion, savedAt: new Date().toISOString() });
  });
}

/** Re-read the latest version (or a specific one with ?version=N) - the editor uses this for restore. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const { id } = await params;

    const versionParam = new URL(request.url).searchParams.get("version");
    const wantedVersion = versionParam ? Number.parseInt(versionParam, 10) : null;

    const update = await prisma.update.findFirst({
      where: { id, companyId: company.id },
      include: {
        versions: {
          where: wantedVersion !== null && Number.isFinite(wantedVersion) ? { version: wantedVersion } : {},
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });
    if (!update) throw notFound("Update not found.");
    if (wantedVersion !== null && update.versions.length === 0) throw notFound("That version doesn't exist.");

    const content = parseContent(update.versions[0]?.content);
    return ok({
      id: update.id,
      title: update.title,
      subject: update.subject,
      tone: update.tone,
      status: update.status,
      currentVersion: update.currentVersion,
      version: update.versions[0]?.version ?? 0,
      periodStart: update.periodStart,
      periodEnd: update.periodEnd,
      sections: SECTION_KEYS.map((k) => ({ key: k, html: content[k] })),
    });
  });
}
