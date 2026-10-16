import type { Connection, Provider } from "@prisma/client";
import { startOfMonth } from "date-fns";
import { prisma } from "../db";
import { decryptSecret } from "../crypto";
import { sendSlackAlert } from "../alerts";
import { connectors, errMessage } from "./index";

export interface SyncOutcome {
  ok: boolean;
  points: number;
  error?: string;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  STRIPE: "Stripe",
  HUBSPOT: "HubSpot",
  MIXPANEL: "Mixpanel",
  MANUAL: "Manual",
};

/**
 * Pull metrics for one connection, replace this month's snapshots,
 * and track failures so a silently-breaking connector surfaces fast:
 * status flips to ERROR, the founder sees a banner, and after the
 * second consecutive failure we page the operator via Slack.
 */
export async function syncConnection(
  companyId: string,
  connection: Connection,
): Promise<SyncOutcome> {
  const connector = connectors[connection.provider];
  if (!connector) {
    return { ok: false, points: 0, error: `No connector implementation for ${connection.provider}.` };
  }
  if (!connection.accessTokenEnc) {
    return { ok: false, points: 0, error: "Connection has no stored credentials - reconnect it." };
  }

  const token = decryptSecret(connection.accessTokenEnc);
  const meta = (connection.meta as Record<string, string> | null) ?? {};
  const monthStart = startOfMonth(new Date());

  try {
    const result = await connector.sync(token, { days: 30, meta });

    await prisma.$transaction([
      // Replace this month's points for this provider so re-syncs stay idempotent
      prisma.metricSnapshot.deleteMany({
        where: { companyId, provider: connection.provider, periodStart: { gte: monthStart } },
      }),
      prisma.metricSnapshot.createMany({
        data: result.points.map((p) => ({
          companyId,
          provider: connection.provider,
          metric: p.metric,
          value: p.value,
          currency: p.currency ?? null,
          unit: p.unit ?? null,
          periodStart: monthStart,
          periodEnd: new Date(),
        })),
      }),
      prisma.connection.update({
        where: { id: connection.id },
        data: {
          status: "ACTIVE",
          lastSyncedAt: new Date(),
          lastError: null,
          lastErrorAt: null,
          consecutiveFailures: 0,
          accountLabel: result.accountLabel ?? connection.accountLabel,
          externalAccountId: result.externalAccountId ?? connection.externalAccountId,
        },
      }),
    ]);

    return { ok: true, points: result.points.length };
  } catch (err) {
    const message = errMessage(err);
    const failures = connection.consecutiveFailures + 1;

    await prisma.connection.update({
      where: { id: connection.id },
      data: {
        status: "ERROR",
        lastError: message.slice(0, 500),
        lastErrorAt: new Date(),
        consecutiveFailures: failures,
      },
    });

    if (failures >= 2) {
      await sendSlackAlert(
        `Backer connector failing\nProvider: ${PROVIDER_LABELS[connection.provider]}\nCompany: ${companyId}\nFailures: ${failures}\nError: ${message}`,
      );
    }

    return { ok: false, points: 0, error: message };
  }
}
