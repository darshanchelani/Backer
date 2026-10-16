import { PLAN_LIMITS } from "@/lib/entitlements";
import { getAuthedContext } from "@/lib/auth";
import { conflict, handleApi, ok, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { onboardingSchema, type InvestorInput } from "@/lib/schemas";

export async function POST(request: Request) {
  return handleApi(async () => {
    const { user, company } = await getAuthedContext();
    if (company) throw conflict("You already have a workspace.", "already_onboarded");

    const body = await parseJson(request, onboardingSchema);

    // Dedupe investors by email (first occurrence wins)
    const seen = new Set<string>();
    const unique: InvestorInput[] = [];
    for (const inv of body.investors) {
      if (!seen.has(inv.email)) {
        seen.add(inv.email);
        unique.push(inv);
      }
    }

    // Free tier starts with a cap; extras are reported back so the UI can be honest.
    const cap = PLAN_LIMITS.FREE.maxInvestors ?? unique.length;
    const toImport = unique.slice(0, cap);
    const skipped = unique.length - toImport.length;

    const created = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          ownerId: user.id,
          name: body.companyName,
          stage: body.stage,
          website: body.website ?? null,
          cadence: body.cadence,
          cadenceAnchorDay: body.cadenceAnchorDay ?? null,
          senderName: body.founderName,
        },
      });

      if (toImport.length > 0) {
        await tx.investor.createMany({
          data: toImport.map((inv) => ({
            companyId: company.id,
            name: inv.name,
            email: inv.email,
            firm: inv.firm ?? null,
            type: inv.type,
            notes: inv.notes ?? null,
          })),
          skipDuplicates: true,
        });
      }

      if (body.founderName && body.founderName !== user.name) {
        await tx.user.update({ where: { id: user.id }, data: { name: body.founderName } });
      }

      return company;
    });

    return ok({
      companyId: created.id,
      importedInvestors: toImport.length,
      skippedInvestors: skipped,
    });
  });
}
