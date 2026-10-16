import type { MetricKind } from "@prisma/client";
import { prisma } from "../db";
import { formatMetricValue, METRIC_META } from "../metrics-meta";

export interface DraftMetricPoint {
  metric: MetricKind;
  label: string;
  value: number;
  formatted: string;
  provider: string;
  unit: string | null;
  periodStart: Date;
}

/**
 * The latest value per metric for drafting. A founder-entered number wins
 * over a connector's (they may have a better number than Stripe's MRR),
 * otherwise the most recent snapshot wins. Same dedupe rule as /metrics.
 */
export async function getLatestMetrics(companyId: string): Promise<DraftMetricPoint[]> {
  const snapshots = await prisma.metricSnapshot.findMany({
    where: { companyId },
    orderBy: [{ capturedAt: "desc" }],
    take: 300,
  });

  const byMetric = new Map<MetricKind, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    const existing = byMetric.get(s.metric);
    if (!existing) {
      byMetric.set(s.metric, s);
      continue;
    }
    if (existing.provider !== "MANUAL" && s.provider === "MANUAL") {
      byMetric.set(s.metric, s);
    }
  }

  const order = Object.keys(METRIC_META) as MetricKind[];
  return [...byMetric.values()]
    .sort((a, b) => order.indexOf(a.metric) - order.indexOf(b.metric))
    .map((s) => ({
      metric: s.metric,
      label: METRIC_META[s.metric].label,
      value: s.value,
      formatted: formatMetricValue(s.metric, s.value, s.unit),
      provider: s.provider,
      unit: s.unit,
      periodStart: s.periodStart,
    }));
}
