import { endOfMonth, startOfMonth } from "date-fns";
import {
  MetricsClient,
  type ConnectionView,
  type ConnectorProvider,
  type MetricRowView,
} from "@/components/metrics/metrics-client";
import { requireCompanyPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { limitsFor } from "@/lib/entitlements";
import { periodLabel } from "@/lib/format";
import { METRIC_META } from "@/lib/metrics-meta";
import type { MetricKind } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const { company } = await requireCompanyPage();
  const limits = limitsFor(company.plan);

  const [connections, snapshots] = await Promise.all([
    prisma.connection.findMany({
      where: { companyId: company.id, status: { not: "REVOKED" } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.metricSnapshot.findMany({
      where: { companyId: company.id },
      orderBy: [{ periodStart: "desc" }, { capturedAt: "desc" }],
      take: 300,
    }),
  ]);

  // Latest point per (provider, metric) - that's what flows into drafts.
  const seen = new Set<string>();
  const latest: MetricRowView[] = [];
  for (const s of snapshots) {
    const key = `${s.provider}:${s.metric}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push({
      id: s.id,
      provider: s.provider,
      metric: s.metric,
      value: s.value,
      unit: s.unit,
      periodStart: s.periodStart.toISOString(),
      periodEnd: s.periodEnd.toISOString(),
      capturedAt: s.capturedAt.toISOString(),
    });
  }

  const metricOrder = Object.keys(METRIC_META) as MetricKind[];
  latest.sort((a, b) => metricOrder.indexOf(a.metric) - metricOrder.indexOf(b.metric));

  const connectionViews: ConnectionView[] = connections.map((c) => ({
    id: c.id,
    provider: c.provider as ConnectorProvider,
    status: c.status,
    accountLabel: c.accountLabel,
    lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
    lastError: c.lastError,
    consecutiveFailures: c.consecutiveFailures,
  }));

  return (
    <MetricsClient
      connections={connectionViews}
      metrics={latest}
      limit={limits.maxConnections}
      isDev={process.env.NODE_ENV !== "production"}
      monthLabel={periodLabel(startOfMonth(new Date()), endOfMonth(new Date()))}
    />
  );
}
