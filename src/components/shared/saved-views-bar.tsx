"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Plus, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type SavedView = {
  id: string;
  name: string;
  params: string;
};

type SavedViewsBarProps = {
  storageKey: string;
  basePath: string;
};

const MAX_VIEWS = 10;

export function SavedViewsBar({ storageKey, basePath }: SavedViewsBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [views, setViews] = useState<SavedView[]>([]);
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setViews(JSON.parse(raw) as SavedView[]);
    } catch {
      // ignore
    }
  }, [storageKey]);

  function persist(next: SavedView[]) {
    setViews(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function handleSave() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    const currentParams = searchParams.toString();
    const newView: SavedView = {
      id: crypto.randomUUID(),
      name: trimmed,
      params: currentParams,
    };
    persist([...views, newView]);
    setNaming(false);
    setNameInput("");
  }

  function handleApply(view: SavedView) {
    router.push(`${basePath}?${view.params}`);
  }

  function handleDelete(id: string) {
    persist(views.filter((v) => v.id !== id));
  }

  function startNaming() {
    setNaming(true);
    setNameInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const currentParams = searchParams.toString();
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
