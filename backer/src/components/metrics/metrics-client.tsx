"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUpRight,
  FlaskConical,
  Loader2,
  Lock,
  PenLine,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProviderBadge } from "@/components/status-badges";
import { fmtRelative } from "@/lib/format";
import { formatMetricValue, METRIC_META, PROVIDER_META } from "@/lib/metrics-meta";
import { cn } from "@/lib/utils";
import type { MetricKind } from "@prisma/client";

export type ConnectorProvider = keyof typeof PROVIDER_META;

export interface ConnectionView {
  id: string;
  provider: ConnectorProvider;
  status: string;
  accountLabel: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

export interface MetricRowView {
  id: string;
  provider: string;
  metric: MetricKind;
  value: number;
  unit: string | null;
  periodStart: string;
  periodEnd: string;
  capturedAt: string;
}

const PROVIDER_ORDER: ConnectorProvider[] = ["STRIPE", "HUBSPOT", "MIXPANEL"];

function providerName(provider: string): string {
  if (provider === "MANUAL") return "Manual";
  return PROVIDER_META[provider as ConnectorProvider]?.name ?? provider;
}

export function MetricsClient({
  connections,
  metrics,
  limit,
  isDev,
  monthLabel,
}: {
  connections: ConnectionView[];
  metrics: MetricRowView[];
  limit: number | null;
  isDev: boolean;
  monthLabel: string;
}) {
  const router = useRouter();
  const [connectProvider, setConnectProvider] = useState<ConnectorProvider | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<ConnectionView | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  const byProvider = useMemo(() => {
    const map = new Map<ConnectorProvider, ConnectionView>();
    for (const c of connections) map.set(c.provider, c);
    return map;
  }, [connections]);

  const atLimit = limit !== null && connections.length >= limit;
  const hasUnconnected = PROVIDER_ORDER.some((p) => !byProvider.has(p));

  function requestConnect(provider: ConnectorProvider) {
    if (atLimit && !byProvider.has(provider)) {
      toast.error("You've hit your plan's connector limit - upgrade to add more.");
      return;
    }
    setConnectProvider(provider);
  }

  async function syncNow(conn: ConnectionView) {
    setSyncingId(conn.id);
    try {
      const res = await fetch(`/api/connections/${conn.id}/sync`, { method: "POST" });
      const data = (await res.json()) as { error?: string; points?: number };
      if (!res.ok) {
        toast.error(data.error ?? "Sync failed - we'll try again on the next health check.");
      } else {
        toast.success(
          `Pulled ${data.points ?? 0} data point${data.points === 1 ? "" : "s"} from ${providerName(conn.provider)}.`,
        );
      }
      router.refresh();
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setSyncingId(null);
    }
  }

  async function confirmDisconnect() {
    if (!disconnecting) return;
    setDisconnectBusy(true);
    try {
      const res = await fetch(`/api/connections/${disconnecting.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Couldn't disconnect.");
        return;
      }
      toast.success(`${providerName(disconnecting.provider)} disconnected.`);
      setDisconnecting(null);
      router.refresh();
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setDisconnectBusy(false);
    }
  }

  async function loadDemo() {
    setDemoBusy(true);
    try {
      const res = await fetch("/api/dev/demo-data", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Couldn't load demo data.");
        return;
      }
      toast.success("Demo data loaded - check Metrics and Updates.");
      router.refresh();
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Metrics</h1>
          <p className="text-sm text-muted-foreground">
            {monthLabel} - these numbers flow straight into your drafts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDev && (
            <Button variant="outline" onClick={() => void loadDemo()} disabled={demoBusy}>
              {demoBusy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FlaskConical className="mr-1.5 h-4 w-4" />
              )}
              Load demo data
            </Button>
          )}
          <Button variant="outline" onClick={() => setManualOpen(true)}>
            <PenLine className="mr-1.5 h-4 w-4" /> Enter by hand
          </Button>
          <Button onClick={() => requestConnect("STRIPE")}>
            <Plus className="mr-1.5 h-4 w-4" /> Add connection
          </Button>
        </div>
      </div>

      {atLimit && hasUnconnected && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            You&apos;ve reached your plan&apos;s limit of {limit} connector{limit === 1 ? "" : "s"}. Free keeps
            {" "}1 forever - Pro raises it to 3.
          </span>
          <Button asChild size="sm" variant="outline">
            <a href="/settings">Upgrade</a>
          </Button>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-medium">Connections</h2>
          <p className="text-sm text-muted-foreground">
            We only read - nothing is written back to your systems. Tokens are encrypted at rest.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {PROVIDER_ORDER.map((p) => {
            const meta = PROVIDER_META[p];
            const conn = byProvider.get(p);
            const failing = conn?.status === "ERROR";
            return (
              <Card key={p} className={cn("flex flex-col", failing && "border-red-200")}>
                <CardContent className="flex flex-1 flex-col gap-3 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{meta.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{meta.blurb}</p>
                    </div>
                    {conn ? <ProviderBadge provider={p} status={conn.status} /> : null}
                  </div>

                  {conn ? (
                    <>
                      <div className="space-y-0.5 text-xs text-muted-foreground">
                        {conn.accountLabel && <p className="truncate font-mono">{conn.accountLabel}</p>}
                        <p>
                          {conn.lastSyncedAt
                            ? `Last synced ${fmtRelative(conn.lastSyncedAt)}`
                            : "Never synced yet"}
                        </p>
                      </div>

                      {conn.lastError && (
                        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium">
                              Sync failing
                              {conn.consecutiveFailures > 1 ? ` (${conn.consecutiveFailures} in a row)` : ""}
                            </p>
                            <p className="mt-0.5 break-words">{conn.lastError}</p>
                            <p className="mt-1.5">
                              Paste a fresh credential to fix it.{" "}
                              <button
                                type="button"
                                className="font-medium underline underline-offset-2"
                                onClick={() => setConnectProvider(p)}
                              >
                                Reconnect
                              </button>
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="mt-auto flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={syncingId === conn.id}
                          onClick={() => void syncNow(conn)}
                        >
                          {syncingId === conn.id ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Sync now
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-red-600"
                          onClick={() => setDisconnecting(conn)}
                        >
                          Disconnect
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="mt-auto pt-1">
                      <Button size="sm" variant="outline" onClick={() => requestConnect(p)}>
                        {atLimit ? (
                          <Lock className="mr-1.5 h-3.5 w-3.5" />
                        ) : (
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Connect
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-medium">This month&apos;s numbers</h2>
          <p className="text-sm text-muted-foreground">
            Latest value per metric - refreshed daily, or right away with &ldquo;Sync now&rdquo;.
          </p>
        </div>
        {metrics.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No numbers yet. Connect Stripe, HubSpot, or Mixpanel - or enter what you have by hand.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => setManualOpen(true)}>
                <PenLine className="mr-1.5 h-4 w-4" /> Enter a number by hand
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((m) => (
              <Card key={m.id}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm text-muted-foreground">{METRIC_META[m.metric].label}</p>
                    <Badge variant="secondary" className="shrink-0 border-transparent text-xs">
                      {providerName(m.provider)}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight">
                    {formatMetricValue(m.metric, m.value, m.unit)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Updated {fmtRelative(m.capturedAt)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <ConnectDialog
        provider={connectProvider}
        onOpenChange={(open) => {
          if (!open) setConnectProvider(null);
        }}
        connectedProviders={new Set(connections.map((c) => c.provider))}
        onConnected={() => router.refresh()}
      />
      <ManualMetricDialog open={manualOpen} onOpenChange={setManualOpen} onSaved={() => router.refresh()} />

      <AlertDialog open={disconnecting !== null} onOpenChange={(o) => !o && setDisconnecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {disconnecting ? providerName(disconnecting.provider) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              We&apos;ll stop pulling metrics from this source. Numbers already imported stay in your history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDisconnect();
              }}
              disabled={disconnectBusy}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConnectDialog({
  provider,
  onOpenChange,
  connectedProviders,
  onConnected,
}: {
  provider: ConnectorProvider | null;
  onOpenChange: (open: boolean) => void;
  connectedProviders: Set<string>;
  onConnected: () => void;
}) {
  const [selected, setSelected] = useState<ConnectorProvider>("STRIPE");
  const [token, setToken] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (provider) {
      setSelected(provider);
      setToken("");
      setExtras({});
    }
  }, [provider]);

  const meta = PROVIDER_META[selected];
  const reconnecting = connectedProviders.has(selected);

  async function connect() {
    const trimmed = token.trim();
    if (trimmed.length < 8) {
      toast.error("That credential looks too short - copy the full token.");
      return;
    }
    if (selected === "MIXPANEL" && (!(extras.projectId ?? "").trim() || !(extras.keyEvent ?? "").trim())) {
      toast.error("Mixpanel needs a project id and a key event name.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selected,
          token: trimmed,
          projectId: extras.projectId,
          keyEvent: extras.keyEvent,
          signupEvent: extras.signupEvent,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        points?: number;
        syncOk?: boolean;
        warning?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't connect - double-check the credential and try again.");
        return;
      }
      toast.success(
        `${meta.name} connected - pulled ${data.points ?? 0} data point${data.points === 1 ? "" : "s"}.`,
      );
      if (data.syncOk === false) {
        toast.warning(data.warning ?? "Connected, but the first sync failed - we'll keep retrying.");
      }
      onOpenChange(false);
      onConnected();
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={provider !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{reconnecting ? `Reconnect ${meta.name}` : `Connect ${meta.name}`}</DialogTitle>
          <DialogDescription>
            {reconnecting
              ? `This replaces the stored credential for ${meta.name} and syncs again immediately.`
              : "Read-only access. The credential is encrypted before it touches our database."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {PROVIDER_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSelected(p)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm transition-colors",
                  selected === p
                    ? "border-primary bg-secondary font-medium text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {PROVIDER_META[p].name}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="conn-token">{meta.authLabel}</Label>
            <Input
              id="conn-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={selected === "STRIPE" ? "rk_live_..." : selected === "HUBSPOT" ? "pat-..." : "Service account secret"}
            />
            <p className="text-xs text-muted-foreground">{meta.authHint}</p>
          </div>

          {meta.extraFields?.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label htmlFor={`conn-${f.key}`}>
                {f.label}
                {f.optional ? <span className="text-muted-foreground"> (optional)</span> : null}
              </Label>
              <Input
                id={`conn-${f.key}`}
                value={extras[f.key] ?? ""}
                onChange={(e) => setExtras((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
              />
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          ))}

          <a
            href={meta.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {meta.docsLabel} <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void connect()} disabled={busy}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {reconnecting ? "Reconnect" : "Connect and pull data"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualMetricDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [metric, setMetric] = useState<MetricKind>("MRR");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMetric("MRR");
      setValue("");
    }
  }, [open]);

  async function save() {
    if (value.trim() === "" || !Number.isFinite(Number(value))) {
      toast.error("Enter a number (negatives are fine - e.g. burn).");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/metrics/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric, value: Number(value) }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't save that metric.");
        return;
      }
      toast.success(`${METRIC_META[metric].label} saved for this month.`);
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enter a metric by hand</DialogTitle>
          <DialogDescription>
            For anything we can&apos;t pull automatically - burn, runway, cash on hand. Saves into the current
            month and feeds your drafts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Metric</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as MetricKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METRIC_META) as MetricKind[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {METRIC_META[m].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{METRIC_META[metric].description}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-value">Value</Label>
            <Input
              id="manual-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={METRIC_META[metric].format === "money" ? "e.g. 42000" : "e.g. 128"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save metric
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
