import { notFound, redirect } from "next/navigation";
import { SendClient, type SendRecipient } from "@/components/updates/send-client";
import { requireCompanyPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { capabilities } from "@/lib/env";
import { getUsage, limitsFor } from "@/lib/entitlements";
import { periodLabel } from "@/lib/format";
import { isEmptyContent, parseContent } from "@/lib/update-content";
import { renderPreviewSections } from "@/lib/email/template";

export const dynamic = "force-dynamic";

export default async function SendUpdatePage({ params }: { params: Promise<{ id: string }> }) {
  const { company } = await requireCompanyPage();
  const { id } = await params;

  const update = await prisma.update.findFirst({
    where: { id, companyId: company.id },
    include: {
      versions: { orderBy: { version: "desc" }, take: 1 },
      emails: { select: { investorId: true, status: true, error: true } },
    },
  });
  if (!update) notFound();

  const content = parseContent(update.versions[0]?.content);
  if (isEmptyContent(content)) redirect(`/updates/${update.id}`);

  const [investors, usage] = await Promise.all([
    prisma.investor.findMany({
      where: { companyId: company.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, type: true },
    }),
    getUsage(company.id),
  ]);

  const limits = limitsFor(company.plan);
  const deliveryByInvestor = new Map(update.emails.map((e) => [e.investorId, e.status]));
  const errorByInvestor = new Map(
    update.emails.filter((e) => e.error).map((e) => [e.investorId, e.error as string]),
  );

  const recipients: SendRecipient[] = investors.map((i) => ({
    id: i.id,
    name: i.name,
    email: i.email,
    type: i.type,
    deliveryStatus: deliveryByInvestor.get(i.id) ?? null,
    error: errorByInvestor.get(i.id) ?? null,
  }));

  const period = periodLabel(update.periodStart, update.periodEnd);
  const planLimitReached =
    !update.sentAt && limits.updatesPerMonth !== null && usage.updatesThisMonth >= limits.updatesPerMonth;

  return (
    <SendClient
      updateId={update.id}
      title={update.title}
      initialSubject={update.subject ?? `${company.name} - ${period} update`}
      periodLabel={period}
      sections={renderPreviewSections(content)}
      recipients={recipients}
      senderName={company.senderName}
      senderEmail={company.senderEmail}
      companyName={company.name}
      emailEnabled={capabilities.email}
      inboundEnabled={capabilities.inbound}
      alreadySent={Boolean(update.sentAt)}
      planLimitReached={planLimitReached}
      freePlan={company.plan === "FREE"}
    />
  );
}
