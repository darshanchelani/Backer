import { prisma } from "../db";
import { syncConnection } from "../connectors/sync";

export interface HealthRunSummary {
  checked: number;
  healthy: number;
  failed: number;
  details: Array<{ connectionId: string; provider: string; ok: boolean; error?: string }>;
}

/**
 * Daily connector health pass: re-sync every live connection so metrics
 * stay fresh and silent breakage surfaces fast (status -> ERROR, banner
 * in the UI, Slack alert after 2 consecutive failures).
 */
export async function runConnectorHealth(): Promise<HealthRunSummary> {
  const connections = await prisma.connection.findMany({
    where: { status: { in: ["ACTIVE", "ERROR", "PENDING"] } },
  });

  const summary: HealthRunSummary = { checked: 0, healthy: 0, failed: 0, details: [] };

  for (const connection of connections) {
    summary.checked += 1;
    const outcome = await syncConnection(connection.companyId, connection);
    if (outcome.ok) {
      summary.healthy += 1;
    } else {
      summary.failed += 1;
    }
    summary.details.push({
      connectionId: connection.id,
      provider: connection.provider,
      ok: outcome.ok,
      error: outcome.error,
    });
  }

  return summary;
}
