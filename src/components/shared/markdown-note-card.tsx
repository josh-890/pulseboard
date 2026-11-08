"use client";

import { useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SimpleActionResult } from "@/lib/types";

type MarkdownNoteCardProps = {
  title: string;
  icon: React.ReactNode;
  initialText: string | null;
  /** Saves the text (blank clears it) — a server action bound to its entity */
  onSave: (text: string) => Promise<SimpleActionResult>;
  /** Shown when there is nothing yet */
  emptyHint: string;
  className?: string;
};

const MD = {
  h1: ({ children }: { children?: React.ReactNode }) => <p className="mb-1 text-base font-bold text-foreground">{children}</p>,
  h2: ({ children }: { children?: React.ReactNode }) => <p className="mb-1 text-sm font-semibold text-foreground">{children}</p>,
  h3: ({ children }: { children?: React.ReactNode }) => <p className="mb-0.5 text-sm font-medium text-foreground">{children}</p>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-foreground">{children}</strong>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-2 list-inside list-disc space-y-0.5 last:mb-0">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-2 list-inside list-decimal space-y-0.5 last:mb-0">{children}</ol>,
  // Links stay text: nothing on these pages leads off-site by accident
  a: ({ children }: { children?: React.ReactNode }) => <span className="text-primary underline">{children}</span>,
  // No images — media is local only, and a profile is words
  img: () => null,
};

/** A markdown text block with an inline editor — a profile, notes */
export function MarkdownNoteCard({ title, icon, initialText, onSave, emptyHint, className }: MarkdownNoteCardProps) {
  const [saved, setSaved] = useState(initialText ?? "");
  const [draft, setDraft] = useState(initialText ?? "");
  const [editing, setEditing] = useState(false);
  const [isPending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await onSave(draft);
      if (!res.success) {
        toast.error(res.error ?? "Could not save");
        return;
      }
      setSaved(draft.trim());
      setEditing(false);
    });
  }

  return (
    <section className={cn("rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className="text-muted-foreground" aria-hidden="true">
            {icon}
          </span>
          {title}
        </h2>
        {!editing && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Edit ${title.toLowerCase()}`}
            onClick={() => {
              setDraft(saved);
              setEditing(true);
            }}
          >
            <Pencil size={13} />
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            autoFocus
            aria-label={title}
            placeholder="Markdown: **bold**, lists, headings"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={isPending} onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={isPending} onClick={save}>
              {isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      ) : saved ? (
        <div className="text-sm leading-relaxed text-muted-foreground">
          <ReactMarkdown components={MD}>{saved}</ReactMarkdown>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            setEditing(true);
          }}
          className="text-sm italic text-muted-foreground/70 hover:text-foreground"
        >
          {emptyHint}
        </button>
      )}
    </section>
  );
}
