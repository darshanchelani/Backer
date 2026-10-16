import { handleApi, notFound, ok } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const { id } = await params;

    const sample = await prisma.voiceSample.findFirst({ where: { id, companyId: company.id } });
    if (!sample) throw notFound("Voice sample not found.");

    await prisma.voiceSample.delete({ where: { id: sample.id } });
    return ok({ deleted: true });
  });
}
