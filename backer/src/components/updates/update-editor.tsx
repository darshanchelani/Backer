"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import {
  ArrowLeft,
  Bold,
  History,
  Italic,
  Link2,
  List,
  Loader2,
  Send,
  Sparkles,
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { UpdateStatusBadge } from "@/components/status-badges";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { TONE_LABELS } from "@/lib/ai/prompts";
import {
  emptyContent,
  SECTION_HINTS,
  SECTION_KEYS,
  SECTION_LABELS,
  type SectionKey,
  type UpdateContent,
} from "@/lib/update-content";
import { cn } from "@/lib/utils";
import type { Tone } from "@prisma/client";

export interface EditorVersion {
  version: number;
  source: string;
  tone: string | null;
  model: string | null;
  createdAt: string;
}

const TONE_ORDER: Tone[] = ["MATTER_OF_FACT", "HYPE", "CAUTIOUS"];

const SOURCE_LABELS: Record<string, string> = {
  AI_DRAFT: "AI draft",
  AI_REGENERATED: "AI rewrite",
  FOUNDER_EDIT: "Your edit",
  REMINDER_PREFILL: "Prefill",
};

export function UpdateEditor({
  id,
  title,
  subject: initialSubject,
  tone: initialTone,
  status,
  currentVersion,
  periodLabel,
  sentAt,
  content,
  versions: initialVersions,
  aiEnabled,
  recipientCount,
}: {
  id: string;
  title: string;
  subject: string;
  tone: Tone;
  status: string;
  currentVersion: number;
  periodLabel: string;
  sentAt: string | null;
  content: UpdateContent;
  versions: EditorVersion[];
  aiEnabled: boolean;
  recipientCount: number;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(initialSubject);
  const [tone, setTone] = useState<Tone>(initialTone);
  const [sections, setSections] = useState<UpdateContent>(content);
  const [revisions, setRevisions] = useState<Record<SectionKey, number>>({
    wins: 0,
    metrics: 0,
    asks: 0,
    whatsNext: 0,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(currentVersion);
  const [versions, setVersions] = useState<EditorVersion[]>(initialVersions);
  const [busySection, setBusySection] = useState<SectionKey | null>(null);
  const [regenTarget, setRegenTarget] = useState<SectionKey | null>(null);
  const [instruction, setInstruction] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState<number | null>(null);
  const activeEditorRef = useRef<Editor | null>(null);

  const sent = status === "SENT";
  const editable = !sent && status !== "SENDING";

  function bumpRevisions(keys: SectionKey[]) {
    setRevisions((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] += 1;
      return next;
    });
  }

  function handleSectionChange(key: SectionKey, html: string) {
    setSections((prev) => (prev[key] === html ? prev : { ...prev, [key]: html }));
    setDirty(true);
  }

  async function saveDraft(quiet = false): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch(`/api/updates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, tone, content: sections }),
      });
      const data = (await res.json()) as { version?: number; error?: string };
      if (!res.ok || !data.version) {
        toast.error(data.error ?? "Couldn't save - try again.");
        return false;
      }
      setVersion(data.version);
      setVersions((prev) => [
        { version: data.version!, source: "FOUNDER_EDIT", tone, model: null, createdAt: new Date().toISOString() },
        ...prev,
      ]);
      setDirty(false);
      if (!quiet) toast.success(`Saved as version ${data.version}.`);
      return true;
    } catch {
      toast.error("Network error - try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function regenerate(section: SectionKey, hint: string) {
    setBusySection(section);
    try {
      const res = await fetch(`/api/updates/${id}/generate-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, tone, instruction: hint.trim() || undefined }),
      });
      const data = (await res.json()) as {
        version?: number;
        content?: UpdateContent;
        ai?: boolean;
        model?: string | null;
        error?: string;
      };
      if (!res.ok || !data.content || !data.version) {
        toast.error(data.error ?? "Couldn't rewrite that section.");
        return;
      }
      setSections((prev) => ({ ...prev, [section]: data.content![section] }));
      bumpRevisions([section]);
      setVersion(data.version);
      setVersions((prev) => [
        {
          version: data.version!,
          source: "AI_REGENERATED",
          tone,
          model: data.model ?? null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setRegenTarget(null);
      setInstruction("");
      if (data.ai === false) {
        toast.info("Rewrote with the template - add OPENAI_API_KEY for AI rewrites.");
      } else {
        toast.success(`${SECTION_LABELS[section]} rewritten.`);
      }
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setBusySection(null);
    }
  }

  async function restore(v: EditorVersion) {
    setRestoreBusy(v.version);
    try {
      const res = await fetch(`/api/updates/${id}?version=${v.version}`);
      const data = (await res.json()) as {
        sections?: Array<{ key: SectionKey; html: string }>;
        subject?: string | null;
        tone?: Tone;
        error?: string;
      };
      if (!res.ok || !data.sections) {
        toast.error(data.error ?? "Couldn't load that version.");
        return;
      }
      const next = emptyContent();
      for (const s of data.sections) next[s.key] = s.html;
      setSections(next);
      bumpRevisions([...SECTION_KEYS]);
      if (data.subject) setSubject(data.subject);
      if (data.tone) setTone(data.tone);
      setDirty(true);
      setHistoryOpen(false);
      toast.info(`Version ${v.version} loaded - review it and save to keep it.`);
    } catch {
      toast.error("Network error - try again.");
    } finally {
      setRestoreBusy(null);
    }
  }

  async function saveAndSend() {
    if (dirty) {
      const saved = await saveDraft(true);
      if (!saved) return;
    }
    router.push(`/updates/${id}/send`);
  }

  type EditorChain = ReturnType<Editor["chain"]>;
  function runToolbar(command: (chain: EditorChain) => EditorChain) {
    const editor = activeEditorRef.current;
    if (!editor || editor.isDestroyed) return;
    command(editor.chain().focus()).run();
  }

  function setLink() {
    const editor = activeEditorRef.current;
    if (!editor || editor.isDestroyed) return;
    const previous = (editor.getAttributes("link").href as string | undefined) ?? "";
    const url = window.prompt("Link URL", previous || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <NextLink
            href="/updates"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> All updates
          </NextLink>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
            <UpdateStatusBadge status={status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {periodLabel} - version {version} of {versions.length}
            {dirty ? " - unsaved changes" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            <History className="mr-1.5 h-4 w-4" /> History
          </Button>
          {sent ? (
            <Button asChild>
              <NextLink href={`/updates/${id}/report`}>View report</NextLink>
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => void saveDraft()} disabled={!dirty || saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {dirty ? "Save draft" : "Saved"}
              </Button>
              <Button onClick={() => void saveAndSend()} disabled={saving}>
                <Send className="mr-1.5 h-4 w-4" /> Review &amp; send
              </Button>
            </>
          )}
        </div>
      </div>

      {sent && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Sent {sentAt ? fmtDateTime(sentAt) : ""} to {recipientCount} investor
          {recipientCount === 1 ? "" : "s"}. This version is read-only.
        </div>
      )}

      <Card>
        <CardContent className="space-y-2 p-4">
          <Label htmlFor="update-subject">Subject line</Label>
          <Input
            id="update-subject"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setDirty(true);
            }}
            disabled={!editable}
            placeholder="Northwind Labs - October update"
          />
          <p className="text-xs text-muted-foreground">
            Sent from your own address - investors reply straight to your inbox.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Voice:</span>
        {TONE_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            disabled={!editable}
            onClick={() => {
              setTone(t);
              setDirty(true);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              tone === t
                ? "border-primary bg-secondary font-medium text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted/60",
              !editable && "cursor-not-allowed opacity-60",
            )}
          >
            {TONE_LABELS[t]}
          </button>
        ))}
        {!aiEnabled && editable && (
          <span className="text-xs text-muted-foreground">
            (no OPENAI_API_KEY - rewrites use the template)
          </span>
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1.5">
          <ToolbarButton label="Bold" icon={Bold} onClick={() => runToolbar((c) => c.toggleBold())} />
          <ToolbarButton label="Italic" icon={Italic} onClick={() => runToolbar((c) => c.toggleItalic())} />
          <ToolbarButton label="Underline" icon={Underline} onClick={() => runToolbar((c) => c.toggleUnderline())} />
          <ToolbarButton label="Bullet list" icon={List} onClick={() => runToolbar((c) => c.toggleBulletList())} />
          <ToolbarButton label="Link" icon={Link2} onClick={setLink} />
          <span className="ml-2 text-xs text-muted-foreground">
            Applies to the section you&apos;re editing - click into one first.
          </span>
        </div>
      )}

      <div className="space-y-4">
        {SECTION_KEYS.map((key) => (
          <SectionEditor
            key={`${key}-${revisions[key]}`}
            section={key}
            html={sections[key]}
            editable={editable}
            busy={busySection === key}
            onHtmlChange={handleSectionChange}
            onFocus={(editor) => {
              activeEditorRef.current = editor;
            }}
            onRegenerate={() => setRegenTarget(key)}
          />
        ))}
      </div>

      <Dialog
        open={regenTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRegenTarget(null);
            setInstruction("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rewrite {regenTarget ? SECTION_LABELS[regenTarget] : ""}</DialogTitle>
            <DialogDescription>
              We keep the other three sections exactly as they are - you can always undo with History.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="regen-instruction">
              Anything specific? <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="regen-instruction"
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. Mention the SOC 2 progress, cut the fluff, lead with revenue"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRegenTarget(null);
                setInstruction("");
              }}
              disabled={busySection !== null}
            >
              Cancel
            </Button>
            <Button
              onClick={() => regenTarget && void regenerate(regenTarget, instruction)}
              disabled={busySection !== null}
            >
              {busySection !== null ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-4 w-4" />
              )}
              Rewrite section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>
              Every draft, rewrite, and edit. Restoring loads it into the editor - nothing is overwritten until
              you save.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {versions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No versions yet - generate a draft first.
              </p>
            ) : (
              versions.map((v) => (
                <div
                  key={v.version}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      v{v.version} - {SOURCE_LABELS[v.source] ?? v.source}
                      {v.version === version ? <span className="text-muted-foreground"> (current)</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtRelative(v.createdAt)}
                      {v.model ? ` - ${v.model}` : ""}
                      {v.tone ? ` - ${TONE_LABELS[v.tone as Tone] ?? v.tone}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void restore(v)}
                    disabled={restoreBusy !== null || !editable}
                  >
                    {restoreBusy === v.version && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {v.version === version ? "Discard changes" : "Restore"}
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

function SectionEditor({
  section,
  html,
  editable,
  busy,
  onHtmlChange,
  onFocus,
  onRegenerate,
}: {
  section: SectionKey;
  html: string;
  editable: boolean;
  busy: boolean;
  onHtmlChange: (section: SectionKey, html: string) => void;
  onFocus: (editor: Editor) => void;
  onRegenerate: () => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: SECTION_HINTS[section] })],
    content: html,
    editable,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: e }) => onHtmlChange(section, e.getHTML()),
    onFocus: ({ editor: e }) => onFocus(e),
    editorProps: {
      attributes: { "aria-label": SECTION_LABELS[section] },
    },
  });

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {SECTION_LABELS[section]}
        </p>
        {editable && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onRegenerate}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Regenerate
          </Button>
        )}
      </div>
      <div className="px-4 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
