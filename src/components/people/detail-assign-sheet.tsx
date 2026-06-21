"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Search, Check, X, Loader2, Frame } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { assignMediaToDetailCategoryAction } from "@/lib/actions/media-actions";

export type AssignPerson = { id: string; name: string };
type CatGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string; entityModel: string | null; alignmentTemplateId: string | null }[];
};

// Reverse "assign this photo to a person's detail category" (always-copy).
// Mount only when open so state initialises fresh each time.
export function DetailAssignSheet({
  open,
  onOpenChange,
  mediaItemId,
  defaultPerson,
  suggestedPeople = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaItemId: string;
  defaultPerson?: AssignPerson | null;
  suggestedPeople?: AssignPerson[];
}) {
  const [person, setPerson] = useState<AssignPerson | null>(defaultPerson ?? null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AssignPerson[]>([]);
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Categories (grouped) for the picker.
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data: CatGroup[]) => setGroups(data))
      .catch(() => {});
  }, []);

  // Debounced person search (only when no person is chosen yet).
  useEffect(() => {
    if (person) return;
    const handle = setTimeout(() => {
      if (q.trim().length < 1) {
        setResults([]);
        return;
      }
      fetch(`/api/people/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((rows: { id: string; displayName: string }[]) =>
          setResults(rows.map((r) => ({ id: r.id, name: r.displayName }))),
        )
        .catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [q, person]);

  function assign() {
    if (!person || !categoryId) return;
    startTransition(async () => {
      const res = await assignMediaToDetailCategoryAction(mediaItemId, person.id, categoryId);
      if (!res.success) {
        toast.error(res.error ?? "Failed to assign");
        return;
      }
      const catName =
        groups.flatMap((g) => g.categories).find((c) => c.id === categoryId)?.name ?? "category";
      if (res.moved) {
        toast.success(`Moved to ${catName} (it was already a detail photo for ${res.personName})`);
      } else if (res.copied) {
        toast.success(`Copied to ${res.personName} and added to ${catName}`);
      } else {
        toast.success(`Added to ${res.personName}'s ${catName}`);
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Assign to detail category</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Person */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Person</label>
            {person ? (
              <div className="flex items-center justify-between rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm">
                <span>{person.name}</span>
                {!defaultPerson && (
                  <button
                    type="button"
                    onClick={() => { setPerson(null); setQ(""); }}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Change person"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search person…"
                    className="w-full rounded-lg border border-white/15 bg-muted/30 py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                {suggestedPeople.length > 0 && q.trim().length === 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedPeople.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPerson(p)}
                        className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs hover:bg-white/10"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
                {results.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto rounded-lg border border-white/10">
                    {results.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setPerson(p)}
                          className="w-full px-3 py-1.5 text-left text-sm hover:bg-white/10"
                        >
                          {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Category (visual / non-entity detail categories) */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Detail category</label>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-white/10 p-2">
              {groups.map((g) => {
                const cats = g.categories.filter((c) => !c.entityModel);
                if (cats.length === 0) return null;
                return (
                  <div key={g.id}>
                    <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {g.name}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {cats.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCategoryId(c.id)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                            categoryId === c.id
                              ? "border-primary/50 bg-primary/15 text-primary"
                              : "border-white/15 bg-white/5 hover:bg-white/10",
                          )}
                        >
                          {categoryId === c.id && <Check size={11} />}
                          {c.name}
                          {c.alignmentTemplateId && <Frame size={10} className="text-amber-400/70" />}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              The photo is copied into {person ? `${person.name}'s` : "the person's"} reference session and added here.
              <Frame size={10} className="mx-0.5 inline text-amber-400/70" /> = alignable (you can align it afterward).
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!person || !categoryId || pending} onClick={assign}>
              {pending && <Loader2 size={14} className="mr-1 animate-spin" />}
              Assign
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
