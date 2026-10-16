"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Activity, Loader2, MessageSquareQuote, Sparkles, Users, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { TONE_DESCRIPTIONS, TONE_LABELS } from "@/lib/ai/prompts";
import { cn } from "@/lib/utils";
import type { Tone } from "@prisma/client";

export interface WedgeMetric {
  label: string;
  formatted: string;
  provider: string;
}

const TONE_ORDER: Tone[] = ["MATTER_OF_FACT", "HYPE", "CAUTIOUS"];

export function NewUpdateWedge({
  monthLabel,
  metrics,
  aiEnabled,
  voiceSampleCount,
  investorCount,
  existingDraftId,
}: {
  monthLabel: string;
  metrics: WedgeMetric[];
  aiEnabled: boolean;
  voiceSampleCount: number;
  investorCount: number;
  existingDraftId: string | null;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [tone, setTone] = useState<Tone>("MATTER_OF_FACT");
  const [stage, setStage] = useState<"idle" | "creating" | "drafting">("idle");
  const busy = stage !== "idle";

  async function generate() {
    setStage("creating");
    try {
      const createRes = await fetch("/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const created = (await createRes.json()) as { id?: string; error?: string };
      if (!createRes.ok || !created.id) {
        toast.error(created.error ?? "Couldn't start the draft.");
        setStage("idle");
        return;
      }

      setStage("drafting");
      const genRes = await fetch(`/api/updates/${created.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone, notes: notes.trim() || undefined }),
      });
      const gen = (await genRes.json()) as { ai?: boolean; error?: string };
      if (!genRes.ok) {
        toast.error(gen.error ?? "Drafting failed - opening the draft so you can write it manually.");
        router.push(`/updates/${created.id}`);
        return;
      }
      if (gen.ai === false) {
        toast.info("Template draft ready - add OPENAI_API_KEY to switch on AI drafting.");
      } else {
        toast.success("Draft ready - give it a read.");
      }
      router.push(`/updates/${created.id}`);
    } catch {
      toast.error("Network error - try again.");
      setStage("idle");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Draft your {monthLabel} update</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We write it from your numbers and your voice. You review and edit before anything sends.
        </p>
        {existingDraftId && (
          <p className="mt-2 text-xs text-muted-foreground">
            You already started this month&apos;s draft - generating again picks up where you left off.{" "}
            <NextLink href={`/updates/${existingDraftId}`} className="underline underline-offset-2">
              Open it
            </NextLink>
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What happened this month?</CardTitle>
              <CardDescription>
                Plain notes are fine - &ldquo;shipped billing v2, closed 3 logos, hired a designer&rdquo;. We turn
                them into prose. Leave empty and we draft from your numbers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={6}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={"- Shipped usage-based billing\n- First enterprise logo signed\n- Hired a senior backend engineer"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Voice</CardTitle>
              <CardDescription>How should this one read?</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {TONE_ORDER.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    tone === t ? "border-primary bg-secondary/60" : "hover:bg-muted/50",
                  )}
                >
                  <p className="text-sm font-medium">{TONE_LABELS[t]}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{TONE_DESCRIPTIONS[t]}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col items-start gap-2">
            <Button size="lg" onClick={() => void generate()} disabled={busy} className="min-w-56">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {stage === "creating" ? "Setting up..." : stage === "drafting" ? "Writing your update..." : "Write my update"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Takes about a minute. Nothing sends until you hit send.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4 text-muted-foreground" /> Going into your draft
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {metrics.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No numbers connected yet -{" "}
                  <NextLink href="/metrics" className="underline underline-offset-2">
                    connect a source or enter them by hand
                  </NextLink>
                  . We&apos;ll still draft an honest update.
                </p>
              ) : (
                metrics.map((m) => (
                  <div key={m.label} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted-foreground">{m.label}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="font-medium">{m.formatted}</span>
                      {m.provider !== "MANUAL" && (
                        <Badge variant="outline" className="px-1 py-0 text-[10px] capitalize">
                          {m.provider.toLowerCase()}
                        </Badge>
                      )}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <MessageSquareQuote className="h-4 w-4 text-muted-foreground" /> Your voice
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {voiceSampleCount > 0 ? (
                <p>
                  Using {voiceSampleCount} past update{voiceSampleCount === 1 ? "" : "s"} as voice samples so
                  the draft sounds like you.
                </p>
              ) : (
                <p>
                  <NextLink href="/settings" className="underline underline-offset-2">
                    Paste a past update in Settings
                  </NextLink>{" "}
                  and drafts will match your voice. Optional, but it&apos;s the difference between good and
                  &ldquo;that&apos;s exactly how I write&rdquo;.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-muted-foreground" /> Drafting engine
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {aiEnabled ? (
                <p>AI drafting is on. If a generation fails we fall back to a clean template - the loop never breaks.</p>
              ) : (
                <p>
                  No <code className="rounded bg-muted px-1 py-0.5">OPENAI_API_KEY</code> yet - you&apos;ll get a
                  structured template draft you can edit by hand.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4 text-muted-foreground" /> Audience
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {investorCount > 0 ? (
                <p>
                  Sending to {investorCount} investor{investorCount === 1 ? "" : "s"} - you pick the exact list at
                  send time.
                </p>
              ) : (
                <p>
                  No investors yet.{" "}
                  <NextLink href="/investors" className="underline underline-offset-2">
                    Add your list
                  </NextLink>{" "}
                  before sending.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
