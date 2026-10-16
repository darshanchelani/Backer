import NextLink from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye, MailCheck, MessageCircle, MousePointerClick, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { ColdBadge, SentimentBadge, UpdateStatusBadge } from "@/components/status-badges";
import { ReportActions } from "@/components/updates/report-actions";
import { requireCompanyPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { limitsFor } from "@/lib/entitlements";
import { fmtDateTime, fmtPercent, fmtRelative, periodLabel } from "@/lib/format";
import { engagementRates } from "@/lib/update-stats";

export const dynamic = "force-dynamic";

export default async function UpdateReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { company } = await requireCompanyPage();
  const { id } = await params;

  const update = await prisma.update.findFirst({
    where: { id, companyId: company.id },
    include: {
      emails: { include: { investor: { select: { id: true, name: true, email: true, firm: true } } } },
      replies: {
        orderBy: { receivedAt: "desc" },
        include: { investor: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { versions: true } },
    },
  });
  if (!update) notFound();
  if (update.status !== "SENT" && update.emails.length === 0) {
    redirect(`/updates/${update.id}`);
  }

  const limits = limitsFor(company.plan);
  const rates = engagementRates(update.emails);
  const isDev = process.env.NODE_ENV !== "production";

  // Latest reply per investor
  const lastReplyByInvestor = new Map<string, (typeof update.replies)[number]>();
  for (const reply of update.replies) {
    if (reply.investorId && !lastReplyByInvestor.has(reply.investorId)) {
      lastReplyByInvestor.set(reply.investorId, reply);
    }
  }

  const rows = update.emails
    .map((email) => {
      const reply = lastReplyByInvestor.get(email.investorId);
      const engaged = email.openCount > 0 || email.clickCount > 0 || Boolean(reply);
      return {
        email,
        investor: email.investor,
        reply,
        engaged,
        stage:
          reply
            ? "Replied"
            : email.clickCount > 0
              ? "Clicked"
              : email.openCount > 0
                ? "Opened"
                : email.status === "DELIVERED"
                  ? "Delivered"
                  : email.status === "BOUNCED"
                    ? "Bounced"
                    : email.status === "FAILED"
                      ? "Failed"
                      : email.status.charAt(0) + email.status.slice(1).toLowerCase(),
      };
    })
    .sort((a, b) => {
      // Most engaged first - that's what founders scan for.
      const score = (r: (typeof rows)[number]) =>
        r.reply ? 4 : r.email.clickCount > 0 ? 3 : r.email.openCount > 0 ? 2 : 1;
      return score(b) - score(a) || a.investor.name.localeCompare(b.investor.name);
    });

  const failedCount = update.emails.filter((e) => e.status === "FAILED").length;
  const bouncedCount = update.emails.filter((e) => e.status === "BOUNCED").length;
  const coldCount = rows.filter((r) => !r.engaged && r.email.status !== "FAILED" && r.email.status !== "BOUNCED").length;

  const sentimentCounts = { POSITIVE: 0, NEUTRAL: 0, CONCERNED: 0, UNKNOWN: 0 };
  for (const reply of update.replies) sentimentCounts[reply.sentiment] += 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <NextLink
            href={`/updates/${update.id}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Back to the update
          </NextLink>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{update.title}</h1>
            <UpdateStatusBadge status={update.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {periodLabel(update.periodStart, update.periodEnd)}
            {update.sentAt ? ` - sent ${fmtDateTime(update.sentAt)}` : ""}
          </p>
        </div>
        <ReportActions
          updateId={update.id}
          isDev={isDev}
          investors={update.emails.map((e) => ({
            id: e.investorId,
            name: e.investor.name,
            email: e.investor.email,
          }))}
        />
      </div>

      {(failedCount > 0 || bouncedCount > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="inline-flex items-center gap-2">
            <TriangleAlert className="h-4 w-4" />
            {failedCount > 0 && `${failedCount} send${failedCount === 1 ? "" : "s"} failed.`}
            {bouncedCount > 0 && `${bouncedCount} bounced.`} Fix the addresses and retry from the send screen.
          </span>
          <Button asChild size="sm" variant="outline">
            <NextLink href={`/updates/${update.id}/send`}>Retry sends</NextLink>
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Delivered" value={rates.delivered} icon={MailCheck} hint={`of ${update.emails.length} sends`} />
        <StatCard
          label="Open rate"
          value={rates.openRate != null ? fmtPercent(rates.openRate) : "-"}
          icon={Eye}
          accent="emerald"
          hint="Investors who opened at least once"
        />
        <StatCard
          label="Click rate"
          value={rates.clickRate != null ? fmtPercent(rates.clickRate) : "-"}
          icon={MousePointerClick}
          hint="Clicked a link in the update"
        />
        <StatCard
          label="Replies"
          value={update.replies.length}
          icon={MessageCircle}
          hint={
            coldCount > 0
              ? `${coldCount} investor${coldCount === 1 ? "" : "s"} haven't engaged`
              : "Everyone engaged at least once"
          }
          accent={coldCount > 0 ? "amber" : "default"}
        />
      </div>

      {limits.sentiment ? (
        update.replies.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Reply sentiment</CardTitle>
              <CardDescription>At a glance, before you read the actual replies below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <SentimentBadge sentiment="POSITIVE" />
                <span className="text-sm text-muted-foreground">{sentimentCounts.POSITIVE}</span>
                <SentimentBadge sentiment="NEUTRAL" />
                <span className="text-sm text-muted-foreground">{sentimentCounts.NEUTRAL}</span>
                <SentimentBadge sentiment="CONCERNED" />
                <span className="text-sm text-muted-foreground">{sentimentCounts.CONCERNED}</span>
                {sentimentCounts.UNKNOWN > 0 && (
                  <>
                    <SentimentBadge sentiment="UNKNOWN" />
                    <span className="text-sm text-muted-foreground">{sentimentCounts.UNKNOWN}</span>
                  </>
                )}
              </div>
              {sentimentCounts.CONCERNED > 0 && (
                <p className="text-xs text-amber-800">
                  Concerned replies deserve a personal note within a day - they&apos;re your early-warning system.
                </p>
              )}
            </CardContent>
          </Card>
        )
      ) : (
        update.replies.length > 0 && (
          <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Sentiment on replies is a{" "}
            <NextLink href="/settings" className="underline underline-offset-2">
              Pro feature
            </NextLink>
            . You still see every reply below.
          </div>
        )
      )}

      {update.replies.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Replies</CardTitle>
            <CardDescription>Straight from your inbox - these came back to your reply-to address.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {update.replies.map((reply) => (
              <div key={reply.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {reply.investor?.name ?? reply.fromEmail}
                    </p>
                    {limits.sentiment && <SentimentBadge sentiment={reply.sentiment} />}
                  </div>
                  <span className="text-xs text-muted-foreground">{fmtRelative(reply.receivedAt)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{reply.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Per investor</CardTitle>
          <CardDescription>
            Who engaged, who went quiet. Cooling-off investors haven&apos;t opened or replied.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.email.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{row.investor.name}</p>
                    {!row.engaged && row.email.status !== "FAILED" && row.email.status !== "BOUNCED" && <ColdBadge />}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.investor.email}
                    {row.investor.firm ? ` - ${row.investor.firm}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div className="w-24">
                    <p className="text-sm font-medium">{row.stage}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.email.lastOpenedAt ? fmtRelative(row.email.lastOpenedAt) : "no opens"}
                    </p>
                  </div>
                  <div className="w-16">
                    <p className="text-sm font-medium">{row.email.openCount}</p>
                    <p className="text-xs text-muted-foreground">opens</p>
                  </div>
                  <div className="w-16">
                    <p className="text-sm font-medium">{row.email.clickCount}</p>
                    <p className="text-xs text-muted-foreground">clicks</p>
                  </div>
                  <div className="w-20">
                    {row.reply ? (
                      limits.sentiment ? (
                        <SentimentBadge sentiment={row.reply.sentiment} />
                      ) : (
                        <span className="text-xs text-muted-foreground">replied</span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
