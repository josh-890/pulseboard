"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Plus, X, Check } from "lucide-react";
import { toast } from "sonner";
import {
  createSavedFilterAction,
  deleteSavedFilterAction,
  importSavedFiltersAction,
} from "@/lib/actions/saved-filter-actions";
import type { SavedFilterRow } from "@/lib/services/saved-filter-service";
import { cn } from "@/lib/utils";

type SavedViewsBarProps = {
  /** "people" | "sets" | "sessions" */
  scope: string;
  basePath: string;
  /** Saved views from the DB (ADR-0033 S6) */
  views: SavedFilterRow[];
  /** localStorage key the pre-S6 views lived under — imported once, then removed */
  legacyStorageKey?: string;
};

const MAX_VIEWS = 20;

/** The view part of a query string — paging is not part of a view */
function viewParams(params: string): string {
  const p = new URLSearchParams(params);
  p.delete("loaded");
  return p.toString();
}

export function SavedViewsBar({ scope, basePath, views, legacyStorageKey }: SavedViewsBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  // One-time move of the views this browser kept in localStorage into the DB
  useEffect(() => {
    if (!legacyStorageKey) return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(legacyStorageKey);
    } catch {
      return;
    }
    if (!raw) return;
    let legacy: { name: string; params: string }[] = [];
    try {
      legacy = (JSON.parse(raw) as { name: string; params: string }[]).filter((v) => v && typeof v.name === "string");
    } catch {
      legacy = [];
    }
    importSavedFiltersAction(scope, legacy.map((v) => ({ name: v.name, params: v.params ?? "" }))).then((res) => {
      if (!res.success) return;
      try {
        localStorage.removeItem(legacyStorageKey);
      } catch {
        // ignore
      }
      if (res.added) {
        toast.success(`Moved ${res.added} saved view${res.added === 1 ? "" : "s"} from this browser`);
        router.refresh();
      }
    });
  }, [legacyStorageKey, scope, router]);

  function handleSave() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    const params = searchParams.toString();
    startTransition(async () => {
      const res = await createSavedFilterAction(scope, trimmed, params);
      if (!res.success) {
        toast.error(res.error ?? "Could not save the view");
        return;
      }
      setNaming(false);
      setNameInput("");
      router.refresh();
    });
  }

  function handleApply(view: SavedFilterRow) {
    router.push(view.params ? `${basePath}?${view.params}` : basePath);
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteSavedFilterAction(id, scope);
      if (!res.success) toast.error(res.error ?? "Could not delete the view");
      router.refresh();
    });
  }

  function startNaming() {
    setNaming(true);
    setNameInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const currentParams = viewParams(searchParams.toString());
  const hasFilters = !!currentParams;
  const atLimit = views.length >= MAX_VIEWS;

  if (views.length === 0 && !hasFilters) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Bookmark size={13} className="shrink-0 text-muted-foreground/60" />

      {views.map((view) => {
        const isActive = view.params === currentParams;
        return (
          <div
            key={view.id}
            className={cn(
              "group flex items-center gap-0.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              isActive
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-white/15 bg-muted/30 text-muted-foreground hover:border-white/25 hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => handleApply(view)}
              className="focus-visible:outline-none"
            >
              {view.name}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(view.id)}
              aria-label={`Delete view "${view.name}"`}
              className="ml-1 rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:outline-none focus-visible:opacity-100"
            >
              <X size={10} />
            </button>
          </div>
        );
      })}

      {naming ? (
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") { setNaming(false); setNameInput(""); }
            }}
            placeholder="View name…"
            className="h-6 w-32 rounded-md border border-input bg-background px-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!nameInput.trim()}
            className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            onClick={() => { setNaming(false); setNameInput(""); }}
            className="rounded-md border border-white/15 bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/80"
          >
            <X size={12} />
          </button>
        </div>
      ) : hasFilters && !atLimit ? (
        <button
          type="button"
          onClick={startNaming}
          className="flex items-center gap-1 rounded-full border border-dashed border-white/20 px-2.5 py-0.5 text-xs text-muted-foreground/60 transition-colors hover:border-white/30 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus size={10} />
          Save view
        </button>
      ) : null}

      {atLimit && !naming && (
        <span className="text-[10px] text-muted-foreground/50">
          Max {MAX_VIEWS} saved views
        </span>
      )}
    </div>
  );
}
