import { InvestorsClient, type InvestorRowView } from "@/components/investors/investors-client";
import { requireCompanyPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { limitsFor } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export default async function InvestorsPage() {
  const { company } = await requireCompanyPage();
  const limits = limitsFor(company.plan);

  const [investors, sentUpdates, replies] = await Promise.all([
    prisma.investor.findMany({ where: { companyId: company.id }, orderBy: { name: "asc" } }),
    prisma.update.findMany({
      where: { companyId: company.id, status: "SENT" },
      orderBy: { sentAt: "desc" },
      take: 3,
      select: { id: true },
    }),
    prisma.reply.findMany({
      where: { update: { companyId: company.id }, investorId: { not: null } },
      orderBy: { receivedAt: "desc" },
      take: 200,
      select: { investorId: true, receivedAt: true, sentiment: true },
    }),
  ]);

  const sentIds = sentUpdates.map((u) => u.id);
  const emails =
    sentIds.length > 0
      ? await prisma.emailMessage.findMany({
          where: { updateId: { in: sentIds } },
          select: { investorId: true, updateId: true, openCount: true, clickCount: true, lastOpenedAt: true },
        })
      : [];

  // Engagement per investor
  const stats = new Map<
    string,
    { opens: number; clicks: number; lastOpenedAt: Date | null; engagedLastTwo: boolean; receivedLastTwo: boolean }
  >();
  const lastTwoIds = sentIds.slice(0, 2);
  for (const e of emails) {
    const s = stats.get(e.investorId) ?? {
      opens: 0,
      clicks: 0,
      lastOpenedAt: null as Date | null,
      engagedLastTwo: false,
      receivedLastTwo: false,
    };
    s.opens += e.openCount;
    s.clicks += e.clickCount;
    if (e.lastOpenedAt && (!s.lastOpenedAt || e.lastOpenedAt > s.lastOpenedAt)) s.lastOpenedAt = e.lastOpenedAt;
    if (lastTwoIds.includes(e.updateId)) {
      s.receivedLastTwo = true;
      if (e.openCount > 0 || e.clickCount > 0) s.engagedLastTwo = true;
    }
    stats.set(e.investorId, s);
  }

  // Replies mean engagement even when the open pixel missed
  const repliedLastTwo = new Set(
    replies.filter((r) => r.investorId !== null).map((r) => r.investorId as string),
  );
  for (const [investorId, s] of stats) {
    if (repliedLastTwo.has(investorId)) {
      s.engagedLastTwo = true;
      stats.set(investorId, s);
    }
  }

  // Latest reply (with sentiment) per investor
  const lastReply = new Map<string, { receivedAt: Date; sentiment: string }>();
  for (const r of replies) {
    if (!r.investorId || lastReply.has(r.investorId)) continue;
    lastReply.set(r.investorId, { receivedAt: r.receivedAt, sentiment: r.sentiment });
  }

  const rows: InvestorRowView[] = investors.map((inv) => {
    const s = stats.get(inv.id);
    const reply = lastReply.get(inv.id);
    return {
      id: inv.id,
      name: inv.name,
      email: inv.email,
      firm: inv.firm,
      type: inv.type,
      notes: inv.notes,
      opens: s?.opens ?? 0,
      clicks: s?.clicks ?? 0,
      lastOpenedAt: s?.lastOpenedAt?.toISOString() ?? null,
      lastReplyAt: reply?.receivedAt.toISOString() ?? null,
      lastSentiment: reply?.sentiment ?? null,
      cold: Boolean(s?.receivedLastTwo && !s.engagedLastTwo),
    };
  });

  return <InvestorsClient rows={rows} showSentiment={limits.sentiment} limit={limits.maxInvestors} />;
}
