import { z } from "zod";
import { startOfMonth } from "date-fns";
import { handleApi, ok, parseJson } from "@/lib/api";
import { requireApiCompany } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MONEY_METRICS } from "@/lib/metrics-meta";

// Manual entry is the universal fallback (and what demo mode uses):
// any metric, upserted into the current month so it feeds the drafter.
const manualSchema = z.object({
  metric: z.enum([
    "MRR",
    "REVENUE",
    "NEW_CUSTOMERS",
    "CHURNED_CUSTOMERS",
    "REFUNDS",
    "PIPELINE_VALUE",
    "DEALS_OPEN",
    "DEALS_WON",
    "ACTIVE_USERS",
    "NEW_SIGNUPS",
    "EVENTS_TRACKED",
    "BURN",
    "CASH_ON_HAND",
    "RUNWAY_MONTHS",
  ]),
  value: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
});

export async function POST(request: Request) {
  return handleApi(async () => {
    const { company } = await requireApiCompany();
    const body = await parseJson(request, manualSchema);

    const monthStart = startOfMonth(new Date());
    const isMoney = MONEY_METRICS.includes(body.metric);

    const snapshot = await prisma.metricSnapshot.upsert({
      where: {
        companyId_provider_metric_periodStart: {
          companyId: company.id,
          provider: "MANUAL",
          metric: body.metric,
          periodStart: monthStart,
        },
      },
      create: {
        companyId: company.id,
        provider: "MANUAL",
        metric: body.metric,
        value: body.value,
        currency: isMoney ? "USD" : null,
        unit: isMoney ? "USD" : null,
        periodStart: monthStart,
        periodEnd: new Date(),
      },
      update: {
        value: body.value,
        currency: isMoney ? "USD" : null,
        periodEnd: new Date(),
        capturedAt: new Date(),
      },
    });

    return ok({ snapshot: { id: snapshot.id, metric: snapshot.metric, value: snapshot.value } });
  });
}
