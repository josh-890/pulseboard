"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, StarOff, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  createSavedSearchAction,
  deleteSavedSearchAction,
  togglePinSavedSearchAction,
} from "@/lib/actions/saved-search-actions";
import {
  specToUrlParams,
  type FilterSpec,
} from "@/lib/types/filter-spec";
import type { SavedSearchSummary } from "@/lib/services/saved-search-service";

type SavedSearchMenuProps = {
  saved: SavedSearchSummary[];
  currentSpec: FilterSpec;
  scope: string;
};

export function SavedSearchMenu({ saved, currentSpec, scope }: SavedSearchMenuProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = (s: SavedSearchSummary) => {
    const qs = specToUrlParams(s.filterSpec).toString();
    startTransition(() => {
      router.replace(qs ? `/people?${qs}` : "/people", { scroll: false });
    });
    setOpen(false);
  };

  const save = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    await createSavedSearchAction(scope, newName.trim(), currentSpec);
    setBusy(false);
    setNewName("");
    setShowSaveForm(false);
  };

  const togglePin = async (s: SavedSearchSummary) => {
    await togglePinSavedSearchAction(s.id, !s.pinned);
  };

  const remove = async (s: SavedSearchSummary) => {
    if (!confirm(`Delete saved search "${s.name}"?`)) return;
    await deleteSavedSearchAction(s.id);
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs hover:bg-white/10"
      >
        <span className="flex items-center gap-1.5">
          <Star size={12} className="text-blue-600 dark:text-blue-400" />
          Saved searches{saved.length > 0 ? ` (${saved.length})` : ""}
        </span>
        <span className="text-muted-foreground">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="space-y-1 rounded-md border border-white/10 bg-card/40 p-1.5">
          {saved.length === 0 && (
            <p className="px-1.5 py-1 text-[11px] text-muted-foreground/70">
              No saved searches yet.
            </p>
          )}
          {saved.map((s) => (
            <div
              key={s.id}
              className="group flex items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-white/5"
            >
              <button
                type="button"
                onClick={() => togglePin(s)}
                className={cn(
                  "shrink-0",
                  s.pinned ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground/40 hover:text-muted-foreground",
                )}
                title={s.pinned ? "Unpin" : "Pin"}
              >
                {s.pinned ? <Star size={11} fill="currentColor" /> : <StarOff size={11} />}
              </button>
              <button
                type="button"
                onClick={() => load(s)}
                className="flex-1 truncate text-left hover:text-blue-700 dark:hover:text-blue-300"
              >
                {s.name}
              </button>
              <button
                type="button"
                onClick={() => remove(s)}
                className="shrink-0 opacity-0 group-hover:opacity-100"
                title="Delete"
              >
                <Trash2 size={11} className="text-muted-foreground/60 hover:text-red-400" />
              </button>
            </div>
          ))}

          {!showSaveForm ? (
            <button
              type="button"
              onClick={() => setShowSaveForm(true)}
              className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <Plus size={11} />
              Save current filter
            </button>
          ) : (
            <div className="flex items-center gap-1 pt-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name…"
                autoFocus
                className="h-6 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") { setShowSaveForm(false); setNewName(""); }
                }}
              />
              <Button
                size="sm"
                disabled={busy || !newName.trim()}
                onClick={save}
                className="h-6 px-2 text-[11px]"
              >
                Save
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
