import { z } from "zod";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { handleApi, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

/**
 * Start (or resume) a draft for the current period. Drafting is free -
 * the plan limit on updates-per-month is enforced at send time.
 */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const body = await parseJson(request, createSchema);

    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());

    // One in-progress draft per period - pick up where they left off.
    const existing = await prisma.update.findFirst({
      where: { companyId: company.id, periodStart: monthStart, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (existing) {
      return ok({ id: existing.id, reused: true });
    }

    const update = await prisma.update.create({
      data: {
        companyId: company.id,
        title: body.title ?? `${format(monthStart, "MMMM yyyy")} update`,
        periodStart: monthStart,
        periodEnd: monthEnd,
      },
      select: { id: true },
    });

    return ok({ id: update.id, reused: false }, 201);
  });
}
