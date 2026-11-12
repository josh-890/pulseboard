"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Search, Check, X, Loader2, Frame, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  assignMediaToDetailCategoryAction,
  ensureReferenceSessionAction,
} from "@/lib/actions/media-actions";
import { getAlignmentTemplateForCategoryAction } from "@/lib/actions/motif-template-actions";
import { MotifAligner } from "@/components/people/motif-aligner";
import type { MotifTemplateRecord } from "@/lib/services/motif-template-service";
import type { DetailUse } from "@/lib/services/detail-use-service";

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
  mediaItemUrl,
  defaultPerson,
  restrictTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaItemId: string;
  mediaItemUrl: string;
  defaultPerson?: AssignPerson | null;
  // When set (e.g. a set/session's participants), the person MUST be one of
  // these — no free search. 1 entry → auto-selected + locked.
  restrictTo?: AssignPerson[];
}) {
  const restricted = !!(restrictTo && restrictTo.length > 0);
  const locked = restricted && restrictTo!.length === 1;
  const [person, setPerson] = useState<AssignPerson | null>(
    defaultPerson ?? (locked ? restrictTo![0] : null),
  );
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AssignPerson[]>([]);
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Slice 2: align path. When set, swap the dialog for the MotifAligner.
  const [aligner, setAligner] = useState<{ template: MotifTemplateRecord; referenceSessionId: string } | null>(null);
  const [preparingAlign, setPreparingAlign] = useState(false);
  // Where this photo is already used for the chosen person (2026-11-12).
  const [uses, setUses] = useState<{ personId: string; items: DetailUse[] } | null>(null);

  const selectedCategory = groups.flatMap((g) => g.categories).find((c) => c.id === categoryId) ?? null;
  const isAlignable = !!selectedCategory?.alignmentTemplateId;
  const currentUses = uses && person && uses.personId === person.id ? uses.items : [];
  const usesHere = currentUses.filter((u) => u.categoryId === categoryId);
  const copyHere = usesHere.filter((u) => u.kind === "copy");
  const alignedHere = usesHere.filter((u) => u.kind === "aligned");
  const usedCategoryIds = new Set(currentUses.map((u) => u.categoryId).filter((id): id is string => !!id));
  const usedSummary = [
    ...new Set(
      currentUses
        .filter((u) => u.categoryName)
        .map((u) => (u.kind === "aligned" ? `${u.categoryName} (aligned)` : (u.categoryName as string))),
    ),
  ];

  // Load where this photo is already used once a person is chosen.
  useEffect(() => {
    if (!person) return;
    let live = true;
    fetch(`/api/media/${mediaItemId}/detail-uses?personId=${encodeURIComponent(person.id)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((items: DetailUse[]) => {
        if (live) setUses({ personId: person.id, items });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [person, mediaItemId]);

  // Categories (grouped) for the picker.
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data: CatGroup[]) => setGroups(data))
      .catch(() => {});
  }, []);

  // Debounced person search (only when no person is chosen yet + not restricted).
  useEffect(() => {
    if (person || restricted) return;
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
  }, [q, person, restricted]);

  function assign(force = false) {
    if (!person || !categoryId) return;
    startTransition(async () => {
      const res = await assignMediaToDetailCategoryAction(mediaItemId, person.id, categoryId, { force });
      const catName =
        groups.flatMap((g) => g.categories).find((c) => c.id === categoryId)?.name ?? "category";
      if (!res.success) {
        if (res.code === "ALREADY_IN_CATEGORY") {
          // Someone else added it meanwhile (or the check hadn't loaded): show the warning.
          setUses({ personId: person.id, items: [...currentUses.filter((u) => u.categoryId !== categoryId), ...res.existing] });
          toast.warning(`This photo is already in ${catName} — nothing added`);
          return;
        }
        toast.error(res.error ?? "Failed to assign");
        return;
      }
      const also = res.alsoIn.length > 0 ? ` (also in ${res.alsoIn.join(", ")})` : "";
      if (res.moved) {
        toast.success(`Moved to ${catName} (it was already a detail photo for ${res.personName})`);
      } else if (res.copied) {
        toast.success(`Copied to ${res.personName} and added to ${catName}${also}`);
      } else {
        toast.success(`Added to ${res.personName}'s ${catName}${also}`);
      }
      onOpenChange(false);
    });
  }

  function startAlign() {
    if (!person || !categoryId || !isAlignable) return;
    setPreparingAlign(true);
    void (async () => {
      try {
        const [template, ref] = await Promise.all([
          getAlignmentTemplateForCategoryAction(categoryId),
          ensureReferenceSessionAction(person.id),
        ]);
        if (!template) {
          toast.error("No alignment template bound to this category");
          return;
        }
        if (!ref.success || !ref.referenceSessionId) {
          toast.error(ref.error ?? "Could not resolve reference session");
          return;
        }
        setAligner({ template, referenceSessionId: ref.referenceSessionId });
      } finally {
        setPreparingAlign(false);
      }
    })();
  }

  // Slice 2: aligner takes over (full-screen portal) — bakes a normalized crop
  // from the source and links it as the aligned detail (assignAlignedImageAction).
  if (aligner && person) {
    return (
      <MotifAligner
        source={{ id: mediaItemId, url: mediaItemUrl }}
        template={aligner.template}
        personId={person.id}
        referenceSessionId={aligner.referenceSessionId}
        onSaved={() => {
          toast.success(`Aligned & added to ${person.name}'s ${selectedCategory?.name ?? "category"}`);
          setAligner(null);
          onOpenChange(false);
        }}
        onCancel={() => setAligner(null)}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Assign to detail category</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {usedSummary.length > 0 && person && (
            <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground" data-testid="detail-uses-summary">
              Already used for {person.name}: <span className="text-foreground">{usedSummary.join(" · ")}</span>
            </p>
          )}
          {/* Person */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Person</label>
            {person ? (
              <div className="flex items-center justify-between rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm">
                <span>{person.name}</span>
                {/* Allow changing only when there's a real choice (not a locked
                    single participant, not the implicit current person). */}
                {!defaultPerson && !locked && (
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
            ) : restricted ? (
              // Constrained to the set/session participants — choose one, no search.
              <div className="flex flex-wrap gap-1.5">
                {restrictTo!.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPerson(p)}
                    className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-sm hover:bg-white/10"
                  >
                    {p.name}
                  </button>
                ))}
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
                          {usedCategoryIds.has(c.id) && (
                            <span
                              className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-400"
                              title="This photo is already here"
                              aria-label="already used here"
                            />
                          )}
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

          {(copyHere.length > 0 || alignedHere.length > 0) && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2.5 text-xs text-amber-100"
              data-testid="detail-already-here"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1 space-y-1">
                {copyHere.length > 0 && (
                  <p>
                    This photo is already in <strong>{selectedCategory?.name}</strong>
                    {copyHere.length > 1 ? ` (${copyHere.length}×)` : ""}.
                  </p>
                )}
                {alignedHere.length > 0 && (
                  <p>An alignment of this photo already exists in {selectedCategory?.name}. You can align it again.</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                {usesHere.slice(0, 3).map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u.mediaItemId} src={u.thumbUrl} alt="" className="h-10 w-10 rounded object-cover" />
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {isAlignable && (
              <Button
                variant="outline"
                size="sm"
                disabled={!person || !categoryId || preparingAlign}
                onClick={startAlign}
                title="Open the aligner to bake a normalized crop"
              >
                {preparingAlign ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Frame size={13} className="mr-1" />}
                Align
              </Button>
            )}
            <Button
              size="sm"
              variant={copyHere.length > 0 ? "outline" : "default"}
              disabled={!person || !categoryId || pending}
              onClick={() => assign(copyHere.length > 0)}
            >
              {pending && <Loader2 size={14} className="mr-1 animate-spin" />}
              {copyHere.length > 0 ? "Add again anyway" : isAlignable ? "Add as-is" : "Assign"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
