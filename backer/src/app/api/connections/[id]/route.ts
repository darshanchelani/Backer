import { handleApi, notFound, ok } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const { id } = await params;

    const connection = await prisma.connection.findFirst({ where: { id, companyId: company.id } });
    if (!connection) throw notFound("Connection not found.");

    await prisma.connection.delete({ where: { id } });
    return ok({ deleted: true });
  });
}
