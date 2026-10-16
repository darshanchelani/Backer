import { Prisma } from "@prisma/client";
import { z } from "zod";
import { conflict, handleApi, notFound, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { investorInputSchema } from "@/lib/schemas";

const patchSchema = investorInputSchema.partial();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const { id } = await params;
    const input = await parseJson(request, patchSchema);

    const existing = await prisma.investor.findFirst({ where: { id, companyId: company.id } });
    if (!existing) throw notFound("Investor not found.");

    try {
      const investor = await prisma.investor.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.firm !== undefined ? { firm: input.firm ?? null } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        },
      });
      return ok({ investor });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw conflict("Another investor already uses that email.", "duplicate_email");
      }
      throw err;
    }
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const { id } = await params;

    const existing = await prisma.investor.findFirst({ where: { id, companyId: company.id } });
    if (!existing) throw notFound("Investor not found.");

    await prisma.investor.delete({ where: { id } });
    return ok({ deleted: true });
  });
}
