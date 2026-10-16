import { z } from "zod";
import { badRequest, handleApi, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cadenceSchema, stageSchema } from "@/lib/schemas";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    stage: stageSchema.optional(),
    website: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => {
        if (v === undefined) return undefined;
        if (!v) return null;
        return /^https?:\/\//i.test(v) ? v : `https://${v}`;
      }),
    timezone: z.string().trim().max(60).optional(),
    senderName: z.string().trim().max(120).optional(),
    senderEmail: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "" ? null : v.toLowerCase())),
    cadence: cadenceSchema.optional(),
    cadenceAnchorDay: z.number().int().min(0).max(28).nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: "Nothing to update." });

/** Update the company profile, sending identity, and cadence. */
export async function PATCH(request: Request) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const body = await parseJson(request, patchSchema);

    if (body.senderEmail && !z.email().safeParse(body.senderEmail).success) {
      throw badRequest("That sending address doesn't look like a valid email.", "invalid_sender_email");
    }

    // Anchor day means day-of-month (1-28) for MONTHLY, day-of-week (0-6) otherwise.
    const cadence = body.cadence ?? company.cadence;
    const anchor = body.cadenceAnchorDay !== undefined ? body.cadenceAnchorDay : company.cadenceAnchorDay;
    if (anchor !== null && anchor !== undefined) {
      if (cadence === "MONTHLY" && (anchor < 1 || anchor > 28)) {
        throw badRequest("For a monthly cadence, pick a day of the month between 1 and 28.");
      }
      if (cadence !== "MONTHLY" && (anchor < 0 || anchor > 6)) {
        throw badRequest("For weekly cadences, pick a day of the week (Sunday = 0).");
      }
    }

    const updated = await prisma.company.update({
      where: { id: company.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.stage !== undefined ? { stage: body.stage } : {}),
        ...(body.website !== undefined ? { website: body.website } : {}),
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
        ...(body.senderName !== undefined ? { senderName: body.senderName || null } : {}),
        ...(body.senderEmail !== undefined ? { senderEmail: body.senderEmail } : {}),
        ...(body.cadence !== undefined ? { cadence: body.cadence } : {}),
        ...(body.cadenceAnchorDay !== undefined ? { cadenceAnchorDay: body.cadenceAnchorDay } : {}),
      },
      select: {
        name: true,
        stage: true,
        website: true,
        timezone: true,
        senderName: true,
        senderEmail: true,
        cadence: true,
        cadenceAnchorDay: true,
      },
    });

    return ok({ company: updated });
  });
}
