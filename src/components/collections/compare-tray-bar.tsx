"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Columns2, X, Loader2, Plus, ChevronLeft, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCompareTray } from "@/components/collections/compare-tray-provider";
import { createComparisonAction, addComparisonItemsAction } from "@/lib/actions/comparison-actions";
import { createCollectionAction } from "@/lib/actions/collection-actions";

type Collection = { id: string; name: string; layout: "GRID" | "SIDE_BY_SIDE" };
type Comparison = { id: string; title: string | null; memberCount: number; members: { mediaItemId: string; thumbUrl: string | null }[] };

export function CompareTrayBar() {
  const { items, remove, clear } = useCompareTray();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (items.length === 0 || typeof document === "undefined") return null;

  // Portal to <body> at a z-index above the lightbox (z-100) so the tray stays
  // visible while you gather photos from within the lightbox.
  return (
    <>
      {createPortal(
        <div className="fixed bottom-4 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/15 bg-card/95 p-2 pl-3 shadow-xl backdrop-blur-md">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Columns2 size={14} className="text-amber-500" /> Compare tray
        </span>
        <div className="flex items-center gap-1">
          {items.slice(0, 6).map((it) => (
            <div key={it.mediaItemId} className="group relative h-10 w-10 overflow-hidden rounded-md border border-white/10 bg-muted/40">
              {it.thumbUrl ? (
                <Image src={it.thumbUrl} alt="" fill unoptimized className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center"><ImageIcon size={14} className="text-muted-foreground/50" /></div>
              )}
              <button
                type="button"
                onClick={() => remove(it.mediaItemId)}
                className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remove from tray"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {items.length > 6 && <span className="px-1 text-xs text-muted-foreground">+{items.length - 6}</span>}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Columns2 size={14} /> Make comparison
        </Button>
        <button type="button" onClick={clear} className="rounded-md p-1 text-muted-foreground hover:text-destructive" title="Clear tray" aria-label="Clear tray">
          <X size={15} />
        </button>
        </div>,
        document.body,
      )}

      <CompareTrayDialog
        open={open}
        onOpenChange={setOpen}
        count={items.length}
        mediaItemIds={items.map((i) => i.mediaItemId)}
        onDone={(href) => { clear(); setOpen(false); router.push(href); }}
      />
    </>
  );
}

function CompareTrayDialog({
  open,
  onOpenChange,
  count,
  mediaItemIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  mediaItemIds: string[];
  onDone: (href: string) => void;
}) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<Collection | null>(null);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setSelected(null); setNewName(""); return; }
    fetch("/api/collections/list")
      .then((r) => r.json())
      .then((data: Collection[]) => setCollections(data.filter((c) => c.layout === "SIDE_BY_SIDE")))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!selected) { setComparisons([]); return; }
    fetch(`/api/collections/${selected.id}/comparisons`)
      .then((r) => r.json())
      .then((data: Comparison[]) => setComparisons(data))
      .catch(() => {});
  }, [selected]);

  const run = useCallback(async (fn: () => Promise<{ success: boolean; error?: string; href?: string }>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res.success && res.href) onDone(res.href);
      else if (!res.success) toast.error(res.error ?? "Action failed");
    } finally {
      setBusy(false);
    }
  }, [onDone]);

  const createNewCollection = () =>
    run(async () => {
      if (!newName.trim()) return { success: false, error: "Name required" };
      const res = await createCollectionAction(null, newName.trim(), undefined, "SIDE_BY_SIDE");
      if (!res.success || !res.id) return { success: false, error: res.error };
      if (count < 2) { toast.success("Collection created — add ≥2 photos to make a comparison"); return { success: true, href: `/collections/${res.id}` }; }
      const cmp = await createComparisonAction(res.id, mediaItemIds);
      return cmp.success && cmp.id ? { success: true, href: `/collections/${res.id}/comparison/${cmp.id}` } : { success: false, error: cmp.error };
    });

  const createInSelected = () =>
    selected && run(async () => {
      const cmp = await createComparisonAction(selected.id, mediaItemIds);
      return cmp.success && cmp.id ? { success: true, href: `/collections/${selected.id}/comparison/${cmp.id}` } : { success: false, error: cmp.error };
    });

  const appendTo = (comparisonId: string) =>
    selected && run(async () => {
      const res = await addComparisonItemsAction(comparisonId, mediaItemIds, selected.id);
      return res.success ? { success: true, href: `/collections/${selected.id}/comparison/${comparisonId}` } : { success: false, error: res.error };
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[130] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{count} photo{count !== 1 ? "s" : ""} → a comparison</DialogTitle>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-3 py-1">
            <p className="text-xs text-muted-foreground">Pick a before/after collection:</p>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {collections.length === 0 && <p className="text-sm text-muted-foreground italic">No before/after collections yet.</p>}
              {collections.map((c) => (
                <button key={c.id} type="button" onClick={() => setSelected(c)}
                  className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-left text-sm hover:border-amber-500/40">
                  <span className="truncate">{c.name}</span>
                  <Columns2 size={13} className="shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-white/10 pt-3">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New before/after collection…" className="h-8" />
              <Button size="sm" variant="outline" disabled={!newName.trim() || busy} onClick={createNewCollection} className="gap-1 shrink-0">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <button type="button" onClick={() => setSelected(null)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ChevronLeft size={13} /> collections
            </button>
            <p className="text-sm font-medium">{selected.name}</p>

            <Button size="sm" className="w-full gap-1.5" disabled={count < 2 || busy} onClick={() => createInSelected()}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              New comparison from {count} photo{count !== 1 ? "s" : ""}
            </Button>
            {count < 2 && <p className="text-[11px] text-muted-foreground">Add at least 2 photos to create a new comparison.</p>}

            {comparisons.length > 0 && (
              <div className="space-y-1.5 border-t border-white/10 pt-3">
                <p className="text-xs text-muted-foreground">…or append to an existing comparison:</p>
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {comparisons.map((cmp) => (
                    <button key={cmp.id} type="button" disabled={busy} onClick={() => appendTo(cmp.id)}
                      className={cn("flex w-full items-center gap-2 rounded-lg border border-white/10 bg-background/40 p-1.5 text-left hover:border-amber-500/40")}>
                      <div className="flex gap-0.5">
                        {cmp.members.slice(0, 3).map((m) => (
                          <div key={m.mediaItemId} className="relative h-8 w-8 overflow-hidden rounded bg-muted/40">
                            {m.thumbUrl && <Image src={m.thumbUrl} alt="" fill unoptimized className="object-cover" />}
                          </div>
                        ))}
                      </div>
                      <span className="truncate text-xs">{cmp.title ?? `${cmp.memberCount} photos`}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
