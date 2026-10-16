import { badRequest, handleApi, notFound, ok } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncConnection } from "@/lib/connectors/sync";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const { id } = await params;

    const connection = await prisma.connection.findFirst({ where: { id, companyId: company.id } });
    if (!connection) throw notFound("Connection not found.");

    const outcome = await syncConnection(company.id, connection);
    if (!outcome.ok) throw badRequest(outcome.error ?? "Sync failed.", "connector_sync");

    return ok({ points: outcome.points });
  });
}
