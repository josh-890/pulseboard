"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Star, Frame, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { deleteMediaItemsAction } from "@/lib/actions/media-actions";
import type { DetailDuplicateGroup } from "@/lib/services/detail-use-service";

type DetailDuplicatesDialogProps = {
  personId: string;
  referenceSessionId: string;
  categoryName: string;
  groups: DetailDuplicateGroup[];
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
};

// The same file twice or more in one detail category (2026-11-12). You compare
// and delete one copy at a time — nothing in bulk, two clicks per delete. The
// last copy of a group can't be deleted here, nor one an Aligned image was baked
// from (its re-bake would lose the source).
export function DetailDuplicatesDialog({
  personId,
  referenceSessionId,
  categoryName,
  groups,
  onOpenChange,
  onDeleted,
}: DetailDuplicatesDialogProps) {
  const [armed, setArmed] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Hidden at once, before the reload lands — so the last copy can never go.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const visible = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !gone.has(it.mediaItemId)) }))
    .filter((g) => g.items.length > 1);

  async function remove(mediaItemId: string) {
    if (armed !== mediaItemId) {
      setArmed(mediaItemId);
      return;
    }
    setDeleting(mediaItemId);
    const res = await deleteMediaItemsAction([mediaItemId], personId, referenceSessionId);
    setDeleting(null);
    setArmed(null);
    if (!res.success) {
      toast.error(res.error ?? "Could not delete the copy");
      return;
    }
    setGone((prev) => new Set([...prev, mediaItemId]));
    toast.success("Duplicate copy deleted");
    onDeleted();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="detail-duplicates-dialog">
        <DialogHeader>
          <DialogTitle>Duplicates in {categoryName}</DialogTitle>
          <DialogDescription>
            The same file is in this category more than once. Delete the copies you don&apos;t need, one at a time.
          </DialogDescription>
        </DialogHeader>
        {visible.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No duplicates left.</p>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {visible.map((g) => (
              <div key={g.hash} className="rounded-lg border border-white/10 p-3">
                <div className="mb-2 text-xs text-muted-foreground">{g.items.length} copies of the same file</div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {g.items.map((it) => {
                    const blocked = it.isAlignSource ? "An aligned image was baked from this copy" : null;
                    const isArmed = armed === it.mediaItemId;
                    return (
                      <div key={it.mediaItemId} className="space-y-1.5">
                        <div className="relative aspect-square overflow-hidden rounded-md bg-muted/30">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={it.thumbUrl} alt={it.filename} className="h-full w-full object-cover" loading="lazy" />
                          <div className="absolute left-1 top-1 flex gap-1">
                            {it.isRepresentative && (
                              <span className="rounded bg-amber-500/90 p-0.5 text-black" title="Representative of this category">
                                <Star size={10} />
                              </span>
                            )}
                            {it.isAlignSource && (
                              <span className="rounded bg-black/70 p-0.5 text-amber-300" title="Source of an aligned image">
                                <Frame size={10} />
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground" title={it.filename}>
                          Added {new Date(it.linkedAt).toLocaleDateString()}
                          {it.otherUsages.length > 0 && ` · also ${it.otherUsages.join(", ").toLowerCase()}`}
                        </div>
                        <button
                          type="button"
                          disabled={!!blocked || deleting !== null}
                          title={blocked ?? (isArmed ? "Click again to delete" : "Delete this copy")}
                          onClick={() => void remove(it.mediaItemId)}
                          onBlur={() => { if (isArmed) setArmed(null); }}
                          className={cn(
                            "flex w-full items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
                            isArmed
                              ? "border-red-500/60 bg-red-500/20 text-red-200"
                              : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10",
                          )}
                        >
                          {deleting === it.mediaItemId ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          {isArmed ? "Confirm delete" : "Delete copy"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
