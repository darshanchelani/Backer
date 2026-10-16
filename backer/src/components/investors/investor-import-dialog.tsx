"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { parseInvestorText } from "@/lib/parse-investors";
import { INVESTOR_TYPE_LABELS, type InvestorInput } from "@/lib/schemas";

export function InvestorImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<InvestorInput[]>([]);
  const [invalid, setInvalid] = useState(0);
  const [importing, setImporting] = useState(false);

  function parse(next: string) {
    setText(next);
    const result = parseInvestorText(next);
    setRows(result.rows);
    setInvalid(result.invalid);
  }

  async function handleFile(file: File) {
    try {
      parse(await file.text());
      toast.success(`Parsed ${file.name}`);
    } catch {
      toast.error("Couldn't read that file - paste the list instead.");
    }
  }

  async function submit() {
    if (rows.length === 0) {
      toast.error("Nothing to import yet - paste a list first.");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/investors/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = (await res.json()) as {
        error?: string;
        imported?: number;
        duplicates?: number;
        overLimit?: number;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Import failed.");
        return;
      }
      const parts = [`Imported ${data.imported ?? 0}`];
      if (data.duplicates) parts.push(`${data.duplicates} already on your list`);
      if (data.overLimit) parts.push(`${data.overLimit} over your plan limit - upgrade to add them`);
      toast.success(parts.join(" - "));
      setText("");
      setRows([]);
      setInvalid(0);
      onOpenChange(false);
      onImported();
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import investors</DialogTitle>
          <DialogDescription>
            One per line: Name, Email, Firm, Type. Headers optional. Types: lead, follow-on, board, angel.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          rows={8}
          placeholder={"Maya Chen, maya@northline.vc, Northline Capital, lead\nJames Park, james@gmail.com, , angel"}
          value={text}
          onChange={(e) => parse(e.target.value)}
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
          {rows.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {rows.length} investor{rows.length === 1 ? "" : "s"} ready
              {invalid > 0 ? ` - ${invalid} row(s) skipped` : ""}
            </span>
          )}
        </div>

        {rows.length > 0 && (
          <>
            <Separator />
            <div className="max-h-40 space-y-1.5 overflow-y-auto">
              {rows.slice(0, 30).map((r) => (
                <div key={r.email} className="flex items-center justify-between text-sm">
                  <span className="truncate">
                    <span className="font-medium">{r.name}</span>{" "}
                    <span className="text-muted-foreground">{r.email}</span>
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {INVESTOR_TYPE_LABELS[r.type ?? "OTHER"]}
                  </Badge>
                </div>
              ))}
              {rows.length > 30 && (
                <p className="pt-1 text-xs text-muted-foreground">...and {rows.length - 30} more</p>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={importing || rows.length === 0}>
            {importing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Import {rows.length > 0 ? `${rows.length} investors` : "investors"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
