import { SettingsClient } from "@/components/settings/settings-client";
import { requireCompanyPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUsage, limitsFor, PLAN_META } from "@/lib/entitlements";
import { capabilities } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const { user, company } = await requireCompanyPage();
  const params = await searchParams;

  const [voiceSamples, connections, usage] = await Promise.all([
    prisma.voiceSample.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "desc" } }),
    prisma.connection.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, provider: true, status: true, accountLabel: true, lastSyncedAt: true, lastError: true },
    }),
    getUsage(company.id),
  ]);

  return (
    <SettingsClient
      company={{
        name: company.name,
        stage: company.stage,
        website: company.website,
        senderName: company.senderName,
        senderEmail: company.senderEmail,
        cadence: company.cadence,
        cadenceAnchorDay: company.cadenceAnchorDay,
        plan: company.plan,
        planRenewsAt: company.planRenewsAt?.toISOString() ?? null,
        hasBillingAccount: Boolean(company.stripeCustomerId),
      }}
      ownerName={user.name ?? ""}
      voiceSamples={voiceSamples.map((s) => ({
        id: s.id,
        label: s.label,
        content: s.content,
        createdAt: s.createdAt.toISOString(),
      }))}
      connections={connections.map((c) => ({
        id: c.id,
        provider: c.provider,
        status: c.status,
        accountLabel: c.accountLabel,
        lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
        lastError: c.lastError,
      }))}
      usage={usage}
      limits={limitsFor(company.plan)}
      planMeta={PLAN_META}
      capabilities={{
        email: capabilities.email,
        billing: capabilities.billing,
        ai: capabilities.ai,
        inbound: capabilities.inbound,
      }}
      billingNotice={params.billing ?? null}
    />
  );
}
