"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, FileUp, Loader2, Sparkles, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { parseInvestorText } from "@/lib/parse-investors";
import { cn } from "@/lib/utils";
import {
  CADENCE_LABELS,
  INVESTOR_TYPE_LABELS,
  STAGE_LABELS,
  type InvestorInput,
} from "@/lib/schemas";

type Stage = keyof typeof STAGE_LABELS;
type Cadence = keyof typeof CADENCE_LABELS;

const STEPS = ["You", "Investors", "Data", "Cadence"] as const;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function OnboardingWizard({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [founderName, setFounderName] = useState(defaultName);
  const [companyName, setCompanyName] = useState("");
  const [stage, setStage] = useState<Stage>("SEED");
  const [website, setWebsite] = useState("");

  const [investorText, setInvestorText] = useState("");
  const [investors, setInvestors] = useState<InvestorInput[]>([]);
  const [parseInfo, setParseInfo] = useState<{ invalid: number } | null>(null);

  const [cadence, setCadence] = useState<Cadence>("MONTHLY");
  const [anchorDay, setAnchorDay] = useState(1);

  const canContinue = useMemo(() => {
    if (step === 0) return founderName.trim().length > 0 && companyName.trim().length > 0;
    return true;
  }, [step, founderName, companyName]);

  function parseNow(text: string) {
    const { rows, invalid } = parseInvestorText(text);
    setInvestors(rows);
    setParseInfo({ invalid });
  }

  async function handleFile(file: File) {
    try {
      const text = await file.text();
      setInvestorText(text);
      parseNow(text);
      toast.success(`Parsed ${file.name}`);
    } catch {
      toast.error("Couldn't read that file - paste the list instead.");
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          founderName: founderName.trim(),
          companyName: companyName.trim(),
          stage,
          website: website.trim(),
          cadence,
          cadenceAnchorDay: anchorDay,
          investors,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        importedInvestors?: number;
        skippedInvestors?: number;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Something went wrong creating your workspace.");
        return;
      }
      if (data.skippedInvestors && data.skippedInvestors > 0) {
        toast.info(
          `Imported ${data.importedInvestors} investors (Free plan supports 5 - upgrade anytime for more).`,
        );
      }
      toast.success("Workspace ready - let's draft your first update.");
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Network error - check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-8 text-center">
        <Badge variant="secondary" className="mb-3">
          <Sparkles className="mr-1 h-3 w-3" /> 90 seconds to set up
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight">Set up your Backer workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Four quick questions. Then we&apos;ll show you your first drafted update.
        </p>
      </div>

      {/* Step indicator */}
      <ol className="mb-8 flex items-center justify-center gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                i < step && "bg-primary text-primary-foreground",
                i === step && "border-2 border-primary text-primary",
                i > step && "border text-muted-foreground",
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={cn("hidden sm:inline", i === step ? "font-medium" : "text-muted-foreground")}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border sm:w-10" />}
          </li>
        ))}
      </ol>

      <Card>
        {step === 0 && (
          <>
            <CardHeader>
              <CardTitle>You &amp; your company</CardTitle>
              <CardDescription>The basics - takes 20 seconds.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="founderName">Your name</Label>
                  <Input
                    id="founderName"
                    value={founderName}
                    onChange={(e) => setFounderName(e.target.value)}
                    placeholder="Ada Founder"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Northwind Labs"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
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
                <div className="space-y-2">
                  <Label htmlFor="website">
                    Website <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="website"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="northwind.dev"
                  />
                </div>
              </div>
            </CardContent>
          </>
        )}

        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle>Your investors</CardTitle>
              <CardDescription>
                Paste your list or drop a CSV - one investor per line: Name, Email, Firm, Type. Headers
                optional. You can skip this and add them later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                rows={7}
                placeholder={"Maya Chen, maya@northline.vc, Northline Capital, lead\nJames Park, james@gmail.com, , angel"}
                value={investorText}
                onChange={(e) => {
                  setInvestorText(e.target.value);
                  parseNow(e.target.value);
                }}
              />
              <div className="flex items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.target.value = "";
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <FileUp className="mr-1.5 h-4 w-4" /> Upload CSV
                </Button>
                {investors.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {investors.length} investor{investors.length === 1 ? "" : "s"} ready
                    {parseInfo?.invalid ? ` - ${parseInfo.invalid} row(s) skipped` : ""}
                  </span>
                )}
              </div>

              {investors.length > 0 && (
                <>
                  <Separator />
                  <div className="max-h-48 space-y-1.5 overflow-y-auto">
                    {investors.slice(0, 20).map((inv) => (
                      <div key={inv.email} className="flex items-center justify-between text-sm">
                        <span className="truncate">
                          <span className="font-medium">{inv.name}</span>{" "}
                          <span className="text-muted-foreground">{inv.email}</span>
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {INVESTOR_TYPE_LABELS[inv.type ?? "OTHER"]}
                        </Badge>
                      </div>
                    ))}
                    {investors.length > 20 && (
                      <p className="pt-1 text-xs text-muted-foreground">
                        ...and {investors.length - 20} more
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </>
        )}

        {step === 2 && (
          <>
            <CardHeader>
              <CardTitle>Connect your data</CardTitle>
              <CardDescription>
                Backer drafts from real numbers - Stripe, HubSpot, and Mixpanel. Connect them from the
                dashboard right after this; you can always enter numbers by hand.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: "Stripe", detail: "MRR, revenue, new customers, churn, refunds", icon: "S" },
                { name: "HubSpot", detail: "Pipeline value, deals open / won", icon: "H" },
                { name: "Mixpanel", detail: "Active users, signups, event volume", icon: "M" },
              ].map((p) => (
                <div key={p.name} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-sm font-semibold">
                    {p.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.detail}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    Connect after setup
                  </Badge>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                No connectors yet? Go to Metrics and add this month&apos;s numbers manually - the draft
                engine uses whatever is available.
              </p>
            </CardContent>
          </>
        )}

        {step === 3 && (
          <>
            <CardHeader>
              <CardTitle>How often do you send updates?</CardTitle>
              <CardDescription>
                Pick a rhythm - we&apos;ll remind you 24 hours before each deadline and pre-fill the draft
                with fresh metrics.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {(Object.entries(CADENCE_LABELS) as Array<[Cadence, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setCadence(value);
                      setAnchorDay(value === "MONTHLY" ? 1 : 1);
                    }}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors",
                      cadence === value ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <p className="text-sm font-medium">{label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {value === "MONTHLY" ? "The classic" : value === "BIWEEKLY" ? "Investor-friendly" : "For fast-moving rounds"}
                    </p>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <Label>{cadence === "MONTHLY" ? "Send on day of month" : "Send on weekday"}</Label>
                <Select value={String(anchorDay)} onValueChange={(v) => setAnchorDay(Number(v))}>
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cadence === "MONTHLY"
                      ? Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d}
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

              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                Reminders go to your inbox at {founderName ? founderName.split(" ")[0] : "you"}@... - the
                address you signed up with. You can change any of this in Settings.
              </div>
            </CardContent>
          </>
        )}

        <div className="flex items-center justify-between border-t px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
              {step === 1 && investors.length === 0 ? "Skip for now" : "Continue"}{" "}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Creating...
                </>
              ) : (
                <>
                  Create workspace <Check className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </Card>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Upload className="h-3 w-3" /> Your data stays yours - we never sell or share investor lists.
      </p>
    </div>
  );
}
