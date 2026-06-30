"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  BookOpen,
  Plus,
  Trash2,
  X,
  FileText,
  ChevronDown,
  ChevronRight,
  Layers,
  Users,
  History,
  CornerUpLeft,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { PersonResearchItem } from "@/lib/services/research-service";
import type {
  PersonImportHistory,
  PersonImportEvent,
} from "@/lib/services/import/staging-service";
import { ImportStatusBadge } from "@/components/import/import-status-badge";
import {
  createResearchEntry,
  updateResearchEntry,
  deleteResearchEntry,
} from "@/lib/actions/research-actions";

type Props = {
  personId: string;
  initialEntries: PersonResearchItem[];
  importHistory?: PersonImportHistory;
};

export function PersonResearchTab({ personId, initialEntries, importHistory }: Props) {
  const [entries, setEntries] = useState<PersonResearchItem[]>(initialEntries);
  const [selectedId, setSelectedId] = useState<string | null>(initialEntries[0]?.id ?? null);

  // Adding a new entry
  const [addingTitle, setAddingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, startAdding] = useTransition();
  const addInputRef = useRef<HTMLInputElement>(null);

  // Deleting
  const [deletingId, startDeleting] = useTransition();

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  function handleStartAdd() {
    setNewTitle("");
    setAddingTitle(true);
    setTimeout(() => addInputRef.current?.focus(), 50);
  }

  function handleCancelAdd() {
    setAddingTitle(false);
    setNewTitle("");
  }

  function handleConfirmAdd() {
    if (!newTitle.trim()) { handleCancelAdd(); return; }
    startAdding(async () => {
      const result = await createResearchEntry(personId, newTitle.trim());
      if (result.success && result.id) {
        const newEntry: PersonResearchItem = {
          id: result.id,
          title: newTitle.trim(),
          content: "",
          sortOrder: entries.length,
          createdAt: new Date(),
        };
        setEntries((prev) => [...prev, newEntry]);
        setSelectedId(result.id);
      }
      setAddingTitle(false);
      setNewTitle("");
    });
  }

  function handleDelete(id: string) {
    startDeleting(async () => {
      const result = await deleteResearchEntry(id, personId);
      if (result.success) {
        const remaining = entries.filter((e) => e.id !== id);
        setEntries(remaining);
        if (selectedId === id) {
          setSelectedId(remaining[0]?.id ?? null);
        }
      }
    });
  }

  function handleEntryUpdated(updated: Partial<PersonResearchItem> & { id: string }) {
    setEntries((prev) =>
      prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)),
    );
  }

  return (
    <div className="space-y-4">
      {importHistory && <ImportHistorySection history={importHistory} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-0 rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm overflow-hidden min-h-[420px]">
      {/* ── Left panel: entry list ── */}
      <div className="w-full sm:w-64 shrink-0 flex flex-col border-b border-white/10 sm:border-b-0 sm:border-r sm:border-white/10">
        {/* Add button */}
        <div className="p-3 border-b border-white/10">
          {addingTitle ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={addInputRef}
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirmAdd();
                  if (e.key === "Escape") handleCancelAdd();
                }}
                placeholder="Entry title…"
                disabled={isAdding}
                className="flex-1 min-w-0 rounded-lg border border-white/15 bg-muted/30 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={handleConfirmAdd}
                disabled={isAdding || !newTitle.trim()}
                className="rounded-md px-2 py-1.5 text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-40 transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={handleCancelAdd}
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Cancel"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartAdd}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground border border-dashed border-white/15 hover:border-white/25 hover:text-foreground transition-colors"
            >
              <Plus size={12} />
              New entry
            </button>
          )}
        </div>

        {/* Entry list */}
        <div className="flex-1 overflow-y-auto py-1">
          {entries.length === 0 && !addingTitle && (
            <p className="px-4 py-3 text-xs text-muted-foreground/60 italic">No entries yet</p>
          )}
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelectedId(entry.id)}
              className={cn(
                "group flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors",
                selectedId === entry.id
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
              )}
            >
              <BookOpen size={12} className="shrink-0 opacity-60" />
              <span className="flex-1 truncate text-xs font-medium">{entry.title}</span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`Delete ${entry.title}`}
                onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); handleDelete(entry.id); } }}
                className={cn(
                  "shrink-0 rounded p-0.5 transition-colors",
                  "opacity-0 group-hover:opacity-100",
                  "text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10",
                  deletingId ? "pointer-events-none opacity-40" : "",
                )}
              >
                <Trash2 size={11} />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right panel: entry editor ── */}
      <div className="flex-1 min-w-0 p-5">
        {selected ? (
          <EntryEditor
            key={selected.id}
            entry={selected}
            personId={personId}
            onUpdated={handleEntryUpdated}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground/50 italic">
              Select an entry or add a new one
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ── Import history section ────────────────────────────────────────────────────

function ImportHistorySection({ history }: { history: PersonImportHistory }) {
  const [open, setOpen] = useState(true);
  const { batches, declines, removals } = history;

  // Nothing imported and no decision memory → render nothing (hide for
  // manually-created persons), matching the conditional-tab pattern.
  if (batches.length === 0 && declines.length === 0 && removals.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/20"
      >
        <History size={15} className="text-muted-foreground" />
        <span className="text-sm font-semibold">Import history</span>
        {batches.length > 0 && (
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
            {batches.length} {batches.length === 1 ? "import" : "imports"}
          </span>
        )}
        <ChevronDown
          size={16}
          className={cn(
            "ml-auto text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-white/10 p-4">
          {batches.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">
              No import files for this person — only re-import decisions are recorded below.
            </p>
          ) : (
            <ul className="space-y-2">
              {batches.map((b) => (
                <ImportEventRow key={b.id} event={b} />
              ))}
            </ul>
          )}

          {(declines.length > 0 || removals.length > 0) && (
            <div className="rounded-lg border border-white/10 bg-muted/20 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                <CornerUpLeft size={11} />
                Re-import decisions
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {declines.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      declined
                    </span>
                    <span className="font-mono text-[11px]">{d.kind}</span>
                    <span className="truncate">{d.itemKey}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground/60">
                      {formatRelativeTime(d.declinedAt)}
                    </span>
                  </li>
                ))}
                {removals.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                      removed
                    </span>
                    <span className="font-mono text-[11px]">{r.kind}</span>
                    <span className="truncate">{r.itemKey}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground/60">
                      {formatRelativeTime(r.deletedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ImportEventRow({ event }: { event: PersonImportEvent }) {
  let summary: string;
  switch (event.state) {
    case "DONE":
      summary = event.reviewableTotal > 0 ? "Imported" : "Nothing to review";
      break;
    case "NEEDS_REVIEW":
      summary = `${event.reviewablePending} to review`;
      break;
    case "BLOCKED":
      summary = `${event.blocked} blocked`;
      break;
    case "FAILED":
      summary = "Failed";
      break;
  }

  return (
    <li>
      <Link
        href={`/import/${event.id}`}
        className="group flex items-center gap-3 rounded-lg border border-white/10 bg-card/40 p-2.5 transition-colors hover:bg-card/70"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <FileText size={15} className="text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-full border border-white/15 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
              v{event.version}
            </span>
            <ImportStatusBadge status={event.state} />
            <span className="truncate text-xs text-muted-foreground/70">
              {event.extractionDate
                ? `Extracted ${event.extractionDate.toLocaleDateString()}`
                : formatRelativeTime(event.createdAt)}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{summary}</span>
            {event.setStagedCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Layers size={10} className="opacity-60" />
                {event.setStagedCount} {event.setStagedCount === 1 ? "set" : "sets"} staged
              </span>
            )}
            {event.coModelCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users size={10} className="opacity-60" />
                {event.coModelCount} co-{event.coModelCount === 1 ? "model" : "models"}
              </span>
            )}
          </div>
        </div>
        <ChevronRight
          size={15}
          className="shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground"
        />
      </Link>
    </li>
  );
}

// ── Entry editor ──────────────────────────────────────────────────────────────

type EntryEditorProps = {
  entry: PersonResearchItem;
  personId: string;
  onUpdated: (updated: Partial<PersonResearchItem> & { id: string }) => void;
};

function EntryEditor({ entry, personId, onUpdated }: EntryEditorProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(entry.title);

  const [editingContent, setEditingContent] = useState(false);
  const [contentDraft, setContentDraft] = useState(entry.content);
  const [savedContent, setSavedContent] = useState(entry.content);

  const [isSaving, startSaving] = useTransition();

  async function saveTitle(value: string) {
    const trimmed = value.trim();
    if (!trimmed || trimmed === entry.title) { setEditingTitle(false); setTitleDraft(entry.title); return; }
    startSaving(async () => {
      const result = await updateResearchEntry(personId, { id: entry.id, title: trimmed });
      if (result.success) {
        onUpdated({ id: entry.id, title: trimmed });
      }
      setEditingTitle(false);
    });
  }

  function handleSaveContent() {
    startSaving(async () => {
      const result = await updateResearchEntry(personId, { id: entry.id, content: contentDraft });
      if (result.success) {
        setSavedContent(contentDraft);
        onUpdated({ id: entry.id, content: contentDraft });
      }
      setEditingContent(false);
    });
  }

  function handleCancelContent() {
    setContentDraft(savedContent);
    setEditingContent(false);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Title row */}
      {editingTitle ? (
        <input
          type="text"
          value={titleDraft}
          autoFocus
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => saveTitle(titleDraft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveTitle(titleDraft);
            if (e.key === "Escape") { setEditingTitle(false); setTitleDraft(entry.title); }
          }}
          disabled={isSaving}
          className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-1.5 text-base font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <button
          type="button"
          onClick={() => { setTitleDraft(entry.title); setEditingTitle(true); }}
          className="text-left text-base font-semibold text-foreground hover:text-primary transition-colors"
          title="Click to edit title"
        >
          {entry.title}
        </button>
      )}

      {/* Content area */}
      {editingContent ? (
        <div className="flex flex-1 flex-col gap-2">
          <textarea
            value={contentDraft}
            onChange={(e) => setContentDraft(e.target.value)}
            rows={Math.min(24, Math.max(8, contentDraft.split("\n").length + 2))}
            disabled={isSaving}
            className="w-full flex-1 resize-y rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Write research notes… (supports **bold**, *italic*, # headings, - lists)"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveContent}
              disabled={isSaving}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancelContent}
              disabled={isSaving}
              className="rounded-lg bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : savedContent ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => { setContentDraft(savedContent); setEditingContent(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setContentDraft(savedContent); setEditingContent(true); } }}
          className="flex-1 cursor-text rounded-lg px-3 py-2 -mx-3 -my-2 text-sm leading-relaxed text-muted-foreground transition-colors hover:bg-muted/30 prose prose-sm prose-invert max-w-none"
        >
          <ReactMarkdown urlTransform={(url) => url}>
            {savedContent}
          </ReactMarkdown>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setContentDraft(""); setEditingContent(true); }}
          className="text-left text-sm text-muted-foreground/50 italic hover:text-muted-foreground transition-colors"
        >
          Add research notes…
        </button>
      )}
    </div>
  );
}
