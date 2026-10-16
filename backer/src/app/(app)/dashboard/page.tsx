import NextLink from "next/link";
import { endOfMonth, startOfMonth, subDays } from "date-fns";
import {
  ArrowRight,
  Eye,
  MailCheck,
  MessageCircleWarning,
  PenLine,
  Plus,
  Users,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { UpdateStatusBadge } from "@/components/status-badges";
import { requireCompanyPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { limitsFor } from "@/lib/entitlements";
import { fmtDateTime, fmtPercent, periodLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { company } = await requireCompanyPage();
  const limits = limitsFor(company.plan);
  const monthStart = startOfMonth(new Date());
  const thirtyDaysAgo = subDays(new Date(), 30);

  const [sentThisMonth, recentUpdates, investorCount, snapshotCount, connectionCount, concernedReplies] =
    await Promise.all([
      prisma.update.count({ where: { companyId: company.id, sentAt: { gte: monthStart } } }),
      prisma.update.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          emails: { select: { status: true, openCount: true, clickCount: true, investorId: true } },
          _count: { select: { replies: true } },
        },
      }),
      prisma.investor.count({ where: { companyId: company.id } }),
      prisma.metricSnapshot.count({ where: { companyId: company.id } }),
      prisma.connection.count({ where: { companyId: company.id, status: { not: "REVOKED" } } }),
      limits.sentiment
        ? prisma.reply.count({
            where: {
              update: { companyId: company.id },
              sentiment: "CONCERNED",
              receivedAt: { gte: thirtyDaysAgo },
            },
          })
        : Promise.resolve(0),
    ]);

  function rates(u: (typeof recentUpdates)[number]) {
    const active = u.emails.filter((e) => e.status !== "FAILED" && e.status !== "BOUNCED");
    if (active.length === 0) return { openRate: null as number | null, clickRate: null as number | null, delivered: 0 };
    const opened = active.filter((e) => e.openCount > 0).length;
    const clicked = active.filter((e) => e.clickCount > 0).length;
    return {
      openRate: (opened / active.length) * 100,
      clickRate: (clicked / active.length) * 100,
      delivered: active.length,
    };
  }

  const sentUpdates = recentUpdates.filter((u) => u.status === "SENT");
  const lastSent = sentUpdates[0] ?? null;
  const lastSentRates = lastSent ? rates(lastSent) : null;

  // Investors who haven't engaged (no open, no click) with the last 2 sent updates
  let coldCount = 0;
  const lastTwoIds = sentUpdates.slice(0, 2).map((u) => u.id);
  if (lastTwoIds.length > 0) {
    const emails = await prisma.emailMessage.findMany({
      where: { updateId: { in: lastTwoIds } },
      select: { investorId: true, openCount: true, clickCount: true },
    });
    const engaged = new Set(emails.filter((e) => e.openCount > 0 || e.clickCount > 0).map((e) => e.investorId));
    const repliedIds = await prisma.reply.findMany({
      where: { updateId: { in: lastTwoIds }, investorId: { not: null } },
      select: { investorId: true },
    });
    for (const r of repliedIds) if (r.investorId) engaged.add(r.investorId);
    const allIds = new Set(emails.map((e) => e.investorId));
    coldCount = [...allIds].filter((id) => !engaged.has(id)).length;
  }

  const checklist = [
    {
      done: investorCount > 0,
      label: "Add your investors",
      hint: "Paste a list or upload a CSV - takes a minute.",
      href: "/investors",
      icon: Users,
    },
    {
      done: snapshotCount > 0 || connectionCount > 0,
      label: "Connect your metrics",
      hint: "Stripe, HubSpot, Mixpanel - or enter numbers by hand.",
      href: "/metrics",
      icon: Wand2,
    },
    {
      done: sentUpdates.length > 0,
      label: "Send your first update",
      hint: "We'll draft it from your data in 60 seconds.",
      href: "/updates/new",
      icon: MailCheck,
    },
  ];
  const showChecklist = checklist.some((c) => !c.done);
  const monthLabel = periodLabel(monthStart, endOfMonth(new Date()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {company.name} - {monthLabel}
          </p>
        </div>
        <Button asChild>
          <NextLink href="/updates/new">
            <PenLine className="mr-1.5 h-4 w-4" /> Draft this month&apos;s update
          </NextLink>
        </Button>
      </div>

      {showChecklist && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Get set up</CardTitle>
            <CardDescription>Three steps to your first update - most founders finish in under 10 minutes.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {checklist.map((item) => (
              <NextLink
                key={item.label}
                href={item.href}
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div
                  className={
                    item.done
                      ? "flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                      : "flex h-8 w-8 items-center justify-center rounded-full bg-muted"
                  }
                >
                  {item.done ? <MailCheck className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {item.done ? <s className="text-muted-foreground">{item.label}</s> : item.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                </div>
              </NextLink>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Updates sent this month"
          value={sentThisMonth}
          hint={limits.updatesPerMonth !== null ? `North-star metric. ${limits.updatesPerMonth}/mo on Free.` : "North-star metric."}
          icon={MailCheck}
        />
        <StatCard
          label="Open rate (last update)"
          value={lastSentRates?.openRate != null ? fmtPercent(lastSentRates.openRate) : "-"}
          hint={lastSent ? `Sent ${fmtDateTime(lastSent.sentAt!)}` : "No updates sent yet"}
          icon={Eye}
          accent="emerald"
        />
        {limits.sentiment ? (
          <StatCard
            label="Concerned replies (30d)"
            value={concernedReplies}
            hint={concernedReplies > 0 ? "Worth a personal note within a day." : "All quiet - good sign."}
            icon={MessageCircleWarning}
            accent={concernedReplies > 0 ? "amber" : "default"}
          />
        ) : (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Concerned replies (30d)</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">-</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Reply sentiment is a{" "}
                <NextLink href="/settings" className="underline underline-offset-2">
                  Pro feature
                </NextLink>
                .
              </p>
            </CardContent>
          </Card>
        )}
        <StatCard
          label="Cooling-off investors"
          value={coldCount}
          hint={
            coldCount > 0
              ? "Haven't opened or replied to your last 2 updates."
              : "Everyone's engaged with recent updates."
          }
          icon={MessageCircleWarning}
          accent={coldCount > 0 ? "amber" : "default"}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Recent updates</CardTitle>
            <CardDescription>Sent and in-progress updates with engagement.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <NextLink href="/updates">
              View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </NextLink>
          </Button>
        </CardHeader>
        <CardContent>
          {recentUpdates.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No updates yet. Your first draft is 60 seconds away.</p>
              <Button asChild className="mt-4">
                <NextLink href="/updates/new">
                  <Wand2 className="mr-1.5 h-4 w-4" /> Draft my first update
                </NextLink>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {recentUpdates.map((u) => {
                const r = rates(u);
                return (
                  <NextLink
                    key={u.id}
                    href={`/updates/${u.id}`}
                    className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{u.title}</span>
                        <UpdateStatusBadge status={u.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {periodLabel(u.periodStart, u.periodEnd)}
                        {u.sentAt ? ` - sent ${fmtDateTime(u.sentAt)}` : " - not sent yet"}
                      </p>
                    </div>
                    {u.status === "SENT" ? (
                      <div className="hidden items-center gap-6 text-right sm:flex">
                        <div>
                          <p className="text-sm font-medium">{r.openRate != null ? fmtPercent(r.openRate) : "-"}</p>
                          <p className="text-xs text-muted-foreground">opened</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{r.clickRate != null ? fmtPercent(r.clickRate) : "-"}</p>
                          <p className="text-xs text-muted-foreground">clicked</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{u._count.replies}</p>
                          <p className="text-xs text-muted-foreground">replies</p>
                        </div>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        {u.currentVersion > 0 ? "Drafted" : "Empty"}
                      </Badge>
                    )}
                  </NextLink>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
