"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const PRESETS: Array<{ label: string; body: string }> = [
  {
    label: "Positive",
    body: "Love this update - the growth is impressive. Congrats to the team! Let me know if I can help with intros to fintech folks.",
  },
  {
    label: "Concerned",
    body: "Thanks for the update. I'm a little worried about the churn number and the burn rate - can we grab 15 minutes this week to talk through the runway plan?",
  },
  {
    label: "Question",
    body: "Quick question: is the pipeline number weighted or just raw open deals? Trying to calibrate how to read it.",
  },
];

/**
 * Dev-only helper: simulate an investor reply so the read dashboard
 * (sentiment, engagement, cold flags) can be exercised end to end.
 */
export function ReportActions({
  updateId,
  isDev,
  investors,
}: {
  updateId: string;
  isDev: boolean;
  investors: Array<{ id: string; name: string; email: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [investorId, setInvestorId] = useState(investors[0]?.id ?? "");
  const [body, setBody] = useState(PRESETS[0]?.body ?? "");
  const [busy, setBusy] = useState(false);

  if (!isDev || investors.length === 0) return null;

  async function submit() {
    if (!body.trim()) {
      toast.error("Write something first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/dev/simulate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updateId, investorId, body }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't simulate the reply.");
        return;
      }
      toast.success("Reply recorded - sentiment classified.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FlaskConical className="mr-1.5 h-4 w-4" /> Simulate reply
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Simulate an investor reply</DialogTitle>
            <DialogDescription>
              Dev-only: records a reply exactly like the inbound webhook would, including sentiment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>From investor</Label>
              <Select value={investorId} onValueChange={setInvestorId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {investors.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name} ({i.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="sim-body">Reply text</Label>
                <div className="flex gap-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                      onClick={() => setBody(p.body)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea id="sim-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Record reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
