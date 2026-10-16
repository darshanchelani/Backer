"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  CreditCard,
  Loader2,
  MessageSquareQuote,
  Plug,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { PlanBadge, ProviderBadge } from "@/components/status-badges";
import { fmtRelative } from "@/lib/format";
import { CADENCE_LABELS, STAGE_LABELS } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import type { Plan } from "@prisma/client";

interface PlanLimitsView {
  maxConnections: number | null;
  maxInvestors: number | null;
  updatesPerMonth: number | null;
  voiceSamples: number | null;
  sentiment: boolean;
}

interface PlanMetaView {
  name: string;
  priceMonthly: number;
  tagline: string;
  features: string[];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function SettingsClient({
  company,
  ownerName,
  voiceSamples,
  connections,
  usage,
  limits,
  planMeta,
  capabilities,
  billingNotice,
}: {
  company: {
    name: string;
    stage: keyof typeof STAGE_LABELS;
    website: string | null;
    senderName: string | null;
    senderEmail: string | null;
    cadence: keyof typeof CADENCE_LABELS;
    cadenceAnchorDay: number | null;
    plan: Plan;
    planRenewsAt: string | null;
    hasBillingAccount: boolean;
  };
  ownerName: string;
  voiceSamples: Array<{ id: string; label: string | null; content: string; createdAt: string }>;
  connections: Array<{
    id: string;
    provider: string;
    status: string;
    accountLabel: string | null;
    lastSyncedAt: string | null;
    lastError: string | null;
  }>;
  usage: { connections: number; investors: number; updatesThisMonth: number; voiceSamples: number };
  limits: PlanLimitsView;
  planMeta: Record<Plan, PlanMetaView>;
  capabilities: { email: boolean; billing: boolean; ai: boolean; inbound: boolean };
  billingNotice: string | null;
}) {
  const router = useRouter();

  // ── Profile ──────────────────────────────────────────────────
  const [name, setName] = useState(company.name);
  const [stage, setStage] = useState(company.stage);
  const [website, setWebsite] = useState(company.website ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Sending identity ─────────────────────────────────────────
  const [senderName, setSenderName] = useState(company.senderName ?? ownerName);
  const [senderEmail, setSenderEmail] = useState(company.senderEmail ?? "");
  const [savingSender, setSavingSender] = useState(false);

  // ── Cadence ──────────────────────────────────────────────────
  const [cadence, setCadence] = useState(company.cadence);
  const [anchor, setAnchor] = useState(company.cadenceAnchorDay === null ? "" : String(company.cadenceAnchorDay));
  const [savingCadence, setSavingCadence] = useState(false);

  // ── Voice samples ────────────────────────────────────────────
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceLabel, setVoiceLabel] = useState("");
  const [voiceContent, setVoiceContent] = useState("");
  const [addingVoice, setAddingVoice] = useState(false);
  const [deletingVoice, setDeletingVoice] = useState<string | null>(null);

  // ── Billing ──────────────────────────────────────────────────
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  const voiceAtLimit = limits.voiceSamples !== null && usage.voiceSamples >= limits.voiceSamples;

  useEffect(() => {
    if (cadence === "MONTHLY" && anchor !== "" && Number(anchor) > 28) setAnchor("");
    if (cadence !== "MONTHLY" && anchor !== "" && Number(anchor) > 6) setAnchor("");
  }, [cadence, anchor]);

  async function patchCompany(body: Record<string, unknown>, okMessage: string, onDone?: () => void) {
    const res = await fetch("/api/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(data.error ?? "Couldn't save.");
      return false;
    }
    toast.success(okMessage);
    onDone?.();
    router.refresh();
    return true;
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await patchCompany({ name, stage, website }, "Company profile saved.");
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveSender() {
    setSavingSender(true);
    try {
      await patchCompany(
        { senderName, senderEmail },
        senderEmail ? "Sending identity saved." : "Sending identity cleared.",
      );
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setSavingSender(false);
    }
  }

  async function saveCadence() {
    setSavingCadence(true);
    try {
      await patchCompany(
        { cadence, cadenceAnchorDay: anchor === "" ? null : Number(anchor) },
        "Cadence saved - we'll nudge you when it's time.",
      );
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setSavingCadence(false);
    }
  }

  async function addVoiceSample() {
    if (voiceContent.trim().length < 40) {
      toast.error("Paste at least a couple of sentences - that's what teaches the drafter your voice.");
      return;
    }
    setAddingVoice(true);
    try {
      const res = await fetch("/api/voice-samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: voiceLabel, content: voiceContent }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't save the sample.");
        return;
      }
      toast.success("Voice sample saved - future drafts will match it.");
      setVoiceOpen(false);
      setVoiceLabel("");
      setVoiceContent("");
      router.refresh();
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setAddingVoice(false);
    }
  }

  async function deleteVoiceSample(id: string) {
    setDeletingVoice(id);
    try {
      const res = await fetch(`/api/voice-samples/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Couldn't delete.");
        return;
      }
      toast.success("Voice sample removed.");
      router.refresh();
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setDeletingVoice(null);
    }
  }

  async function upgrade(plan: "PRO" | "SCALE") {
    setUpgrading(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Couldn't start checkout.");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setUpgrading(null);
    }
  }

  async function openPortal() {
    setPortalBusy(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Couldn't open the billing portal.");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setPortalBusy(false);
    }
  }

  const usageRows = [
    {
      label: "Investors",
      used: usage.investors,
      max: limits.maxInvestors,
      upgrade: "Pro allows up to 100; Scale is unlimited.",
    },
    {
      label: "Connectors",
      used: usage.connections,
      max: limits.maxConnections,
      upgrade: "Pro allows 3 (Stripe, HubSpot, Mixpanel); Scale is unlimited.",
    },
    {
      label: "Updates sent this month",
      used: usage.updatesThisMonth,
      max: limits.updatesPerMonth,
      upgrade: "Pro sends unlimited updates.",
    },
    {
      label: "Voice samples",
      used: usage.voiceSamples,
      max: limits.voiceSamples,
      upgrade: "Pro keeps 5 samples.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your profile, sending identity, cadence, voice, and plan.
        </p>
      </div>

      {billingNotice === "success" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Upgrade complete - your new plan is active. Thank you!
        </div>
      )}
      {billingNotice === "cancelled" && (
        <div className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
          Checkout cancelled - no charge was made.
        </div>
      )}

      {/* ── Profile ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="h-4 w-4 text-muted-foreground" /> Company profile
          </CardTitle>
          <CardDescription>Shown on your landing page and used across drafts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="set-name">Company name</Label>
              <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as keyof typeof STAGE_LABELS)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STAGE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="set-site">
              Website <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="set-site"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="northwind.dev"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void saveProfile()} disabled={savingProfile}>
              {savingProfile && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Sending identity ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sending identity</CardTitle>
          <CardDescription>
            Updates go out from your own address - investors reply straight to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="set-sender-name">From name</Label>
              <Input
                id="set-sender-name"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder={ownerName || "Your name"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="set-sender-email">From address</Label>
              <Input
                id="set-sender-email"
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                placeholder={`you@${website.replace(/^https?:\/\//, "") || "yourdomain.com"}`}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {capabilities.email
              ? "This address must be a verified sender in Brevo (Senders, Domains & IPs). Until then, sends will fail."
              : "BREVO_API_KEY isn't set yet, so sends run in simulation mode. Add it to .env to go live."}
          </p>
          <div className="flex justify-end">
            <Button onClick={() => void saveSender()} disabled={savingSender}>
              {savingSender && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save sending identity
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Cadence ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadence</CardTitle>
          <CardDescription>
            We email you a nudge with a one-click draft when it&apos;s time to send.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>How often</Label>
              <Select
                value={cadence}
                onValueChange={(v) => {
                  setCadence(v as keyof typeof CADENCE_LABELS);
                  setAnchor("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CADENCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Preferred day</Label>
              <Select
                value={anchor === "" ? "none" : anchor}
                onValueChange={(v) => setAnchor(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preference</SelectItem>
                  {cadence === "MONTHLY"
                    ? Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          The {ordinal(d)}
                        </SelectItem>
                      ))
                    : WEEKDAYS.map((w, i) => (
                        <SelectItem key={w} value={String(i)}>
                          {w}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void saveCadence()} disabled={savingCadence}>
              {savingCadence && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save cadence
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Voice samples ───────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareQuote className="h-4 w-4 text-muted-foreground" /> Voice samples
            </CardTitle>
            <CardDescription>
              Paste past updates you wrote - the drafter studies them so drafts sound like you.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (voiceAtLimit) {
                toast.error("You've hit your plan's voice sample limit - upgrade to add more.");
                return;
              }
              setVoiceOpen(true);
            }}
            disabled={voiceAtLimit}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add sample
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {usage.voiceSamples} of {limits.voiceSamples ?? "unlimited"} on your plan
            {voiceAtLimit ? " - Free keeps 1; Pro keeps 5." : ""}
          </p>
          {voiceSamples.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No samples yet. Even one past update makes a noticeable difference.
            </p>
          ) : (
            voiceSamples.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.label ?? "Past update"}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.content.slice(0, 200)}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">Added {fmtRelative(s.createdAt)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-600"
                  onClick={() => void deleteVoiceSample(s.id)}
                  disabled={deletingVoice === s.id}
                  aria-label="Delete sample"
                >
                  {deletingVoice === s.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))
          )}
          {!capabilities.ai && (
            <p className="text-xs text-muted-foreground">
              OPENAI_API_KEY isn&apos;t set, so drafts use the template for now - samples will kick in the moment you
              add the key.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Connections ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plug className="h-4 w-4 text-muted-foreground" /> Connections
            </CardTitle>
            <CardDescription>Where your numbers come from.</CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <NextLink href="/metrics">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Manage in Metrics
            </NextLink>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {connections.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Nothing connected yet -{" "}
              <NextLink href="/metrics" className="underline underline-offset-2">
                connect Stripe, HubSpot, or Mixpanel
              </NextLink>
              , or enter numbers by hand.
            </p>
          ) : (
            connections.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <ProviderBadge provider={c.provider} status={c.status} />
                  <div>
                    <p className="text-sm">{c.accountLabel ?? c.provider.toLowerCase()}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.lastSyncedAt ? `Synced ${fmtRelative(c.lastSyncedAt)}` : "Never synced"}
                      {c.lastError ? ` - ${c.lastError.slice(0, 80)}` : ""}
                    </p>
                  </div>
                </div>
                {c.status === "ERROR" && (
                  <Badge variant="secondary" className="border-transparent bg-red-100 text-xs text-red-800">
                    Needs attention
                  </Badge>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Billing ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-muted-foreground" /> Plan &amp; billing
            </CardTitle>
            <CardDescription>
              {company.planRenewsAt
                ? `Renews ${fmtRelative(company.planRenewsAt)}`
                : "Upgrade when you need more room."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <PlanBadge plan={company.plan} />
            {company.hasBillingAccount && capabilities.billing && (
              <Button size="sm" variant="outline" onClick={() => void openPortal()} disabled={portalBusy}>
                {portalBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Manage subscription
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            {usageRows.map((row) => {
              const pct = row.max === null ? 0 : Math.min(100, (row.used / row.max) * 100);
              const atLimit = row.max !== null && row.used >= row.max;
              return (
                <div key={row.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className={cn(atLimit && "font-medium text-amber-700")}>
                      {row.used} / {row.max ?? "unlimited"}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", atLimit ? "bg-amber-500" : "bg-emerald-500")}
                      style={{ width: row.max === null ? "100%" : `${pct}%` }}
                    />
                  </div>
                  {atLimit && <p className="text-xs text-amber-700">{row.upgrade}</p>}
                </div>
              );
            })}
          </div>

          {company.plan !== "SCALE" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["PRO", "SCALE"] as const)
                .filter((p) => p !== company.plan)
                .map((p) => (
                  <div key={p} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{planMeta[p].name}</p>
                      <p className="text-sm">
                        ${planMeta[p].priceMonthly}
                        <span className="text-xs text-muted-foreground">/mo</span>
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{planMeta[p].tagline}</p>
                    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {planMeta[p].features.slice(0, 3).map((f) => (
                        <li key={f}>- {f}</li>
                      ))}
                    </ul>
                    <Button
                      className="mt-4 w-full"
                      variant={p === "PRO" ? "default" : "outline"}
                      onClick={() => void upgrade(p)}
                      disabled={upgrading !== null || !capabilities.billing}
                    >
                      {upgrading === p && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                      Upgrade to {planMeta[p].name}
                    </Button>
                  </div>
                ))}
            </div>
          )}

          {!capabilities.billing && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0" />
              Upgrades need STRIPE_SECRET_KEY plus the two price IDs in .env - see the README&apos;s
              &ldquo;Going live&rdquo; checklist. Until then everything runs on the Free tier.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Voice sample dialog ─────────────────────────────── */}
      <Dialog open={voiceOpen} onOpenChange={setVoiceOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a voice sample</DialogTitle>
            <DialogDescription>
              Paste a past update or investor email you wrote. Plain text is fine - we only study how you write, not
              what you said.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="voice-label">
                Label <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="voice-label"
                value={voiceLabel}
                onChange={(e) => setVoiceLabel(e.target.value)}
                placeholder="March 2026 update"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voice-content">The writing</Label>
              <Textarea
                id="voice-content"
                rows={8}
                value={voiceContent}
                onChange={(e) => setVoiceContent(e.target.value)}
                placeholder="Paste the full text of a past update here..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoiceOpen(false)} disabled={addingVoice}>
              Cancel
            </Button>
            <Button onClick={() => void addVoiceSample()} disabled={addingVoice}>
              {addingVoice && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save sample
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
