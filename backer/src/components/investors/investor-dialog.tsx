"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { INVESTOR_TYPE_LABELS } from "@/lib/schemas";

export interface InvestorEditTarget {
  id: string;
  name: string;
  email: string;
  firm: string | null;
  type: keyof typeof INVESTOR_TYPE_LABELS;
  notes: string | null;
}

export function InvestorDialog({
  open,
  onOpenChange,
  investor,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investor: InvestorEditTarget | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [firm, setFirm] = useState("");
  const [type, setType] = useState<keyof typeof INVESTOR_TYPE_LABELS>("ANGEL");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(investor?.name ?? "");
      setEmail(investor?.email ?? "");
      setFirm(investor?.firm ?? "");
      setType(investor?.type ?? "ANGEL");
      setNotes(investor?.notes ?? "");
    }
  }, [open, investor]);

  async function save() {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(investor ? `/api/investors/${investor.id}` : "/api/investors", {
        method: investor ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, firm, type, notes }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't save the investor.");
        return;
      }
      toast.success(investor ? "Investor updated." : "Investor added.");
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
          <DialogTitle>{investor ? "Edit investor" : "Add investor"}</DialogTitle>
          <DialogDescription>
            {investor ? "Update their details." : "They'll receive your next update."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-name">Name</Label>
              <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maya Chen" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-email">Email</Label>
              <Input
                id="inv-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="maya@northline.vc"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-firm">
                Firm <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="inv-firm"
                value={firm}
                onChange={(e) => setFirm(e.target.value)}
                placeholder="Northline Capital"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as keyof typeof INVESTOR_TYPE_LABELS)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INVESTOR_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-notes">
              Notes <span className="text-muted-foreground">(optional, just for you)</span>
            </Label>
            <Textarea
              id="inv-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Met at demo day. Interested in the API launch."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {investor ? "Save changes" : "Add investor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
