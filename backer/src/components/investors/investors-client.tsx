"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvestorDialog, type InvestorEditTarget } from "./investor-dialog";
import { InvestorImportDialog } from "./investor-import-dialog";
import { ColdBadge, SentimentBadge } from "@/components/status-badges";
import { fmtRelative } from "@/lib/format";
import { INVESTOR_TYPE_LABELS } from "@/lib/schemas";

export interface InvestorRowView {
  id: string;
  name: string;
  email: string;
  firm: string | null;
  type: keyof typeof INVESTOR_TYPE_LABELS;
  notes: string | null;
  opens: number;
  clicks: number;
  lastOpenedAt: string | null;
  lastReplyAt: string | null;
  lastSentiment: string | null;
  cold: boolean;
}

export function InvestorsClient({
  rows,
  showSentiment,
  limit,
}: {
  rows: InvestorRowView[];
  showSentiment: boolean;
  limit: number | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<InvestorEditTarget | null>(null);
  const [deleting, setDeleting] = useState<InvestorRowView | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.firm ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const atLimit = limit !== null && rows.length >= limit;

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/investors/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Couldn't delete.");
        return;
      }
      toast.success(`${deleting.name} removed.`);
      setDeleting(null);
      router.refresh();
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Investors</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} investor{rows.length === 1 ? "" : "s"}
            {limit !== null ? ` - ${rows.length} of ${limit} on your plan` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" /> Import CSV
          </Button>
          <Button
            onClick={() => {
              if (atLimit) {
                toast.error("You've hit your plan's investor limit - upgrade to add more.");
                return;
              }
              setAddOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add investor
          </Button>
        </div>
      </div>

      {atLimit && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            You&apos;ve reached your plan&apos;s limit of {limit} investors. Free keeps this forever - Pro
            raises it to 100.
          </span>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings">Upgrade</Link>
          </Button>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, or firm"
          className="pl-8"
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Investor</TableHead>
              <TableHead>Firm</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Engagement</TableHead>
              <TableHead>Last reply</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  {rows.length === 0
                    ? "No investors yet. Add one, or import your list from a CSV."
                    : "No matches for that search."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                      </div>
                      {r.cold && <ColdBadge />}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.firm ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {INVESTOR_TYPE_LABELS[r.type]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">
                      {r.opens} open{r.opens === 1 ? "" : "s"} - {r.clicks} click{r.clicks === 1 ? "" : "s"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.lastOpenedAt ? `last open ${fmtRelative(r.lastOpenedAt)}` : "never opened"}
                    </p>
                  </TableCell>
                  <TableCell>
                    {r.lastReplyAt ? (
                      <div className="flex items-center gap-2">
                        {showSentiment && r.lastSentiment && <SentimentBadge sentiment={r.lastSentiment} />}
                        <span className="text-xs text-muted-foreground">{fmtRelative(r.lastReplyAt)}</span>
                      </div>
                    ) : showSentiment ? (
                      <span className="text-xs text-muted-foreground">no replies yet</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="h-3 w-3" /> Pro
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            setEditing({
                              id: r.id,
                              name: r.name,
                              email: r.email,
                              firm: r.firm,
                              type: r.type,
                              notes: r.notes,
                            })
                          }
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={() => setDeleting(r)}>
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <InvestorDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        investor={null}
        onSaved={() => router.refresh()}
      />
      <InvestorDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        investor={editing}
        onSaved={() => router.refresh()}
      />
      <InvestorImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => router.refresh()} />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll stop receiving updates. Past opens, clicks, and replies stay in your reports.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleteBusy}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
