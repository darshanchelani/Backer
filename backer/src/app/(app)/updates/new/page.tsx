import { redirect } from "next/navigation";
import { endOfMonth, startOfMonth } from "date-fns";
import { NewUpdateWedge } from "@/components/updates/new-update-wedge";
import { requireCompanyPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { capabilities } from "@/lib/env";
import { periodLabel } from "@/lib/format";
import { getLatestMetrics } from "@/lib/ai/metrics-context";

export const dynamic = "force-dynamic";

export default async function NewUpdatePage() {
  const { company } = await requireCompanyPage();
  const monthStart = startOfMonth(new Date());

  // Resume an in-progress draft for this period instead of starting over.
  const existing = await prisma.update.findFirst({
    where: { companyId: company.id, periodStart: monthStart, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
    select: { id: true, currentVersion: true },
  });
  if (existing && existing.currentVersion > 0) {
    redirect(`/updates/${existing.id}`);
  }

  const [metrics, voiceSampleCount, investorCount] = await Promise.all([
    getLatestMetrics(company.id),
    prisma.voiceSample.count({ where: { companyId: company.id } }),
    prisma.investor.count({ where: { companyId: company.id } }),
  ]);

  return (
    <NewUpdateWedge
      monthLabel={periodLabel(monthStart, endOfMonth(new Date()))}
      metrics={metrics.map((m) => ({ label: m.label, formatted: m.formatted, provider: m.provider }))}
      aiEnabled={capabilities.ai}
      voiceSampleCount={voiceSampleCount}
      investorCount={investorCount}
      existingDraftId={existing?.id ?? null}
    />
  );
}
