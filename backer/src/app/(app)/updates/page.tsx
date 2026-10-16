import NextLink from "next/link";
import { ArrowRight, PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UpdateStatusBadge } from "@/components/status-badges";
import { requireCompanyPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmtDateTime, fmtPercent, periodLabel } from "@/lib/format";
import { engagementRates } from "@/lib/update-stats";

export const dynamic = "force-dynamic";

export default async function UpdatesPage() {
  const { company } = await requireCompanyPage();

  const updates = await prisma.update.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    include: {
      emails: { select: { status: true, openCount: true, clickCount: true } },
      _count: { select: { replies: true, versions: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Updates</h1>
          <p className="text-sm text-muted-foreground">
            Every draft and send, with how your investors engaged.
          </p>
        </div>
        <Button asChild>
          <NextLink href="/updates/new">
            <PenLine className="mr-1.5 h-4 w-4" /> New update
          </NextLink>
        </Button>
      </div>

      {updates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center">
            <p className="text-sm text-muted-foreground">
              No updates yet. Your first draft takes about a minute - we write it from your numbers.
            </p>
            <Button asChild className="mt-4">
              <NextLink href="/updates/new">
                <PenLine className="mr-1.5 h-4 w-4" /> Draft my first update
              </NextLink>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Update</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Clicked</TableHead>
                <TableHead>Replies</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {updates.map((u) => {
                const rates = engagementRates(u.emails);
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <NextLink href={`/updates/${u.id}`} className="group block">
                        <p className="text-sm font-medium group-hover:underline">{u.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {periodLabel(u.periodStart, u.periodEnd)}
                          {u.sentAt ? ` - sent ${fmtDateTime(u.sentAt)}` : " - not sent yet"}
                        </p>
                      </NextLink>
                    </TableCell>
                    <TableCell>
                      <UpdateStatusBadge status={u.status} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {u.status === "SENT" && rates.openRate != null ? (
                        fmtPercent(rates.openRate)
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {u.status === "SENT" && rates.clickRate != null ? (
                        fmtPercent(rates.clickRate)
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {u.status === "SENT" ? u._count.replies : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {u.status !== "SENT" && (
                          <Badge variant="outline" className="text-xs">
                            v{u._count.versions}
                          </Badge>
                        )}
                        <Button asChild variant="ghost" size="sm">
                          <NextLink href={`/updates/${u.id}`} aria-label={`Open ${u.title}`}>
                            <ArrowRight className="h-4 w-4" />
                          </NextLink>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
