import { Prisma } from "@prisma/client";
import { conflict, handleApi, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertWithinLimit } from "@/lib/entitlements";
import { investorInputSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const input = await parseJson(request, investorInputSchema);

    await assertWithinLimit(company, "investors");

    try {
      const investor = await prisma.investor.create({
        data: {
          companyId: company.id,
          name: input.name,
          email: input.email,
          firm: input.firm ?? null,
          type: input.type,
          notes: input.notes ?? null,
        },
      });
      return ok({ investor }, 201);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw conflict("An investor with that email already exists.", "duplicate_email");
      }
      throw err;
    }
  });
}
