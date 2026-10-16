"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  FlaskConical,
  Loader2,
  MailCheck,
  RotateCcw,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { INVESTOR_TYPE_LABELS } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export interface SendRecipient {
  id: string;
  name: string;
  email: string;
  type: keyof typeof INVESTOR_TYPE_LABELS;
  deliveryStatus: string | null;
  error: string | null;
}

interface SendResult {
  sent?: number;
  failed?: number;
  skipped?: number;
  simulated?: boolean;
  errors?: Array<{ email: string; error: string }>;
  error?: string;
}

export function SendClient({
  updateId,
  title,
  initialSubject,
  periodLabel,
  sections,
  recipients,
  senderName,
  senderEmail,
  companyName,
  emailEnabled,
  inboundEnabled,
  alreadySent,
  planLimitReached,
  freePlan,
}: {
  updateId: string;
  title: string;
  initialSubject: string;
  periodLabel: string;
  sections: Array<{ label: string; html: string }>;
  recipients: SendRecipient[];
  senderName: string | null;
  senderEmail: string | null;
  companyName: string;
  emailEnabled: boolean;
  inboundEnabled: boolean;
  alreadySent: boolean;
  planLimitReached: boolean;
  freePlan: boolean;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(initialSubject);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  const sendable = useMemo(() => recipients.filter((r) => r.deliveryStatus === null || r.deliveryStatus === "FAILED"), [recipients]);
  const alreadyDelivered = recipients.length - sendable.length;
  const failedCount = recipients.filter((r) => r.deliveryStatus === "FAILED").length;

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(recipients.filter((r) => r.deliveryStatus === null || r.deliveryStatus === "FAILED").map((r) => r.id)),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = sendable.length > 0 && sendable.every((r) => selected.has(r.id));
  const selectedCount = sendable.filter((r) => selected.has(r.id)).length;

  const blockers: string[] = [];
  if (!senderEmail) blockers.push("Add your sending address in Settings first - investors need to know who it's from.");
  if (planLimitReached)
    blockers.push(
      `You've hit your plan's limit of updates this month. ${freePlan ? "Upgrade to send more this month." : ""}`.trim(),
    );
  if (selectedCount === 0) blockers.push("Pick at least one investor to send to.");

  async function send() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/updates/${updateId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investorIds: [...selected], subject }),
      });
      const data = (await res.json()) as SendResult;
      if (!res.ok) {
        toast.error(data.error ?? "Send failed.");
        return;
      }
      setResult(data);
      if ((data.failed ?? 0) > 0) {
        toast.warning(`Sent to ${data.sent}, failed for ${data.failed}. You can retry the failures.`);
      } else {
        toast.success(
          data.simulated
            ? `Recorded sends to ${data.sent} investors (simulation - no real email).`
            : `Sent to ${data.sent} investor${data.sent === 1 ? "" : "s"}.`,
        );
      }
      router.refresh();
      if ((data.failed ?? 0) === 0) {
        router.push(`/updates/${updateId}/report`);
      }
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <NextLink
          href={`/updates/${updateId}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to the editor
        </NextLink>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Review &amp; send: {title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{periodLabel}</p>
      </div>

      {alreadySent && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          This update has already gone out. Sending again only reaches investors who failed the first time - nobody
          gets it twice.
        </div>
      )}

      {!emailEnabled && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Simulation mode - BREVO_API_KEY isn&apos;t set.</p>
            <p className="mt-0.5">
              Sends are recorded locally (opens, clicks, replies all work in demo mode) but no real email leaves your
              machine. Add the key in <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">.env</code> to go
              live.
            </p>
          </div>
        </div>
      )}

      {planLimitReached && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            You&apos;ve used your {freePlan ? "Free plan's" : "plan's"} update for this month. Pro sends unlimited
            updates.
          </span>
          <Button asChild size="sm" variant="outline">
            <NextLink href="/settings">Upgrade</NextLink>
          </Button>
        </div>
      )}

      {result && (
        <Card className={(result.failed ?? 0) > 0 ? "border-amber-300" : "border-emerald-300"}>
          <CardContent className="space-y-2 pt-5 text-sm">
            <p className="font-medium">
              {result.sent ?? 0} sent
              {(result.skipped ?? 0) > 0 ? ` - ${result.skipped} already delivered` : ""}
              {(result.failed ?? 0) > 0 ? ` - ${result.failed} failed` : ""}
            </p>
            {result.errors && result.errors.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-xs text-red-700">
                {result.errors.map((e) => (
                  <li key={e.email}>
                    <span className="font-medium">{e.email}</span>: {e.error}
                  </li>
                ))}
              </ul>
            )}
            {(result.failed ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                Fix the issue (often a bad address) and hit send again - only the failures will be retried.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Subject line</CardTitle>
            </CardHeader>
            <CardContent>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                From: {senderName ?? companyName}
                {senderEmail ? ` <${senderEmail}>` : " (no sending address yet)"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">How it will read</CardTitle>
              <CardDescription>
                {inboundEnabled
                  ? "Replies land in your reports with sentiment - investors can just hit reply."
                  : "Investors can just hit reply - it goes straight to your inbox."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {sections.map((s) => (
                <div key={s.label}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </p>
                  <div
                    className="tiptap text-sm"
                    dangerouslySetInnerHTML={{ __html: s.html }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">
                Recipients <span className="text-muted-foreground">({selectedCount})</span>
              </CardTitle>
              {sendable.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() =>
                    setSelected(allSelected ? new Set() : new Set(sendable.map((r) => r.id)))
                  }
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              )}
            </CardHeader>
            <CardContent className="space-y-1">
              {recipients.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No investors yet -{" "}
                  <NextLink href="/investors" className="underline underline-offset-2">
                    add your list
                  </NextLink>
                  .
                </p>
              ) : (
                <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
                  {recipients.map((r) => {
                    const done = r.deliveryStatus !== null && r.deliveryStatus !== "FAILED";
                    const failed = r.deliveryStatus === "FAILED";
                    return (
                      <label
                        key={r.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors",
                          done ? "cursor-default opacity-60" : "hover:bg-muted/60",
                        )}
                      >
                        <Checkbox
                          checked={selected.has(r.id)}
                          disabled={done}
                          onCheckedChange={() => toggle(r.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                        </div>
                        {done ? (
                          <Badge variant="secondary" className="border-transparent bg-emerald-100 text-xs text-emerald-800">
                            <MailCheck className="mr-1 h-3 w-3" /> Sent
                          </Badge>
                        ) : failed ? (
                          <Badge variant="secondary" className="border-transparent bg-red-100 text-xs text-red-800">
                            <RotateCcw className="mr-1 h-3 w-3" /> Retry
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            {INVESTOR_TYPE_LABELS[r.type]}
                          </Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {blockers.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <ul className="list-disc space-y-1 pl-4">
                {blockers.map((b) => (
                  <li key={b}>
                    {b}{" "}
                    {b.includes("sending address") && (
                      <NextLink href="/settings" className="underline underline-offset-2">
                        Open settings
                      </NextLink>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Button
            size="lg"
            className="w-full"
            disabled={blockers.length > 0 || sending}
            onClick={() => setConfirmOpen(true)}
          >
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {failedCount > 0 && selectedCount === failedCount
              ? `Retry ${selectedCount} failed send${selectedCount === 1 ? "" : "s"}`
              : `Send to ${selectedCount} investor${selectedCount === 1 ? "" : "s"}`}
          </Button>

          {alreadyDelivered > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {alreadyDelivered} investor{alreadyDelivered === 1 ? " has" : "s have"} already received this update -
              they won&apos;t be emailed twice.
            </p>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send to {selectedCount} investor{selectedCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {emailEnabled ? (
                <>
                  This sends a real email from{" "}
                  <span className="font-medium">{senderEmail}</span> with subject &ldquo;{subject}&rdquo;. Opens,
                  clicks, and replies are tracked.
                </>
              ) : (
                <>
                  Simulation mode: no real email is sent. Sends are recorded so you can test opens, clicks, and
                  replies locally.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void send();
              }}
              disabled={sending}
            >
              {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {emailEnabled ? "Send now" : "Record send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
