import { z } from "zod";
import { handleApi, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertWithinLimit } from "@/lib/entitlements";

const createSchema = z.object({
  label: z.string().trim().max(80).optional(),
  content: z.string().trim().min(40, "Paste at least a couple of sentences.").max(20000),
});

/** List voice samples (used as few-shot examples by the drafter). */
export async function GET() {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const samples = await prisma.voiceSample.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
    });
    return ok({ samples });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const body = await parseJson(request, createSchema);

    await assertWithinLimit(company, "voiceSamples");

    const sample = await prisma.voiceSample.create({
      data: {
        companyId: company.id,
        label: body.label || null,
        content: body.content,
      },
    });

    return ok({ sample }, 201);
  });
}
