import { z } from "zod";
import { handleApi, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUsage, limitsFor } from "@/lib/entitlements";
import { investorInputSchema } from "@/lib/schemas";

const importSchema = z.object({
  rows: z.array(investorInputSchema).max(1000, "Import at most 1000 investors at a time."),
});

export async function POST(request: Request) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const { rows } = await parseJson(request, importSchema);

    // Dedupe within the payload
    const seen = new Set<string>();
    const unique = rows.filter((r) => {
      if (seen.has(r.email)) return false;
      seen.add(r.email);
      return true;
    });
    if (unique.length === 0) {
      return ok({ imported: 0, duplicates: 0, overLimit: 0 });
    }

    // Exclude emails already in the DB
    const existing = await prisma.investor.findMany({
      where: { companyId: company.id, email: { in: unique.map((r) => r.email) } },
      select: { email: true },
    });
    const existingEmails = new Set(existing.map((e) => e.email));
    const fresh = unique.filter((r) => !existingEmails.has(r.email));
    const duplicates = unique.length - fresh.length;

    // Clamp to plan headroom
    const usage = await getUsage(company.id);
    const limits = limitsFor(company.plan);
    const remaining =
      limits.maxInvestors === null ? Number.POSITIVE_INFINITY : Math.max(0, limits.maxInvestors - usage.investors);
    const toImport = fresh.slice(0, remaining === Number.POSITIVE_INFINITY ? fresh.length : remaining);
    const overLimit = fresh.length - toImport.length;

    if (toImport.length > 0) {
      await prisma.investor.createMany({
        data: toImport.map((r) => ({
          companyId: company.id,
          name: r.name,
          email: r.email,
          firm: r.firm ?? null,
          type: r.type,
          notes: r.notes ?? null,
        })),
        skipDuplicates: true,
      });
    }

    return ok({ imported: toImport.length, duplicates, overLimit });
  });
}
