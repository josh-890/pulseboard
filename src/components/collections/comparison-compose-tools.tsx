"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Anchor, ArrowLeft, ArrowRight, Check, Crop, Crosshair, Maximize2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ComparisonComposite, comparisonShape } from "@/components/collections/comparison-composite";
import { ComparisonFitStage } from "@/components/collections/comparison-fit-stage";
import { ComparisonBuilderSheet } from "@/components/collections/comparison-builder-sheet";
import {
  deleteComparisonAction,
  removeComparisonItemAction,
  reorderComparisonItemsAction,
  setComparisonAspectDriverAction,
  setComparisonFitModeAction,
  setComparisonItemFocalAction,
  setComparisonTitleAction,
} from "@/lib/actions/comparison-actions";
import type { ComparisonDetail, ComparisonFitMode } from "@/lib/services/comparison-service";

// Compose mode of the comparison viewer — how the photos of a comparison are put
// together: title, Fill/Fit, focal points (Fill), the aspect-driver (⚓), order,
// adding/removing photos, deleting the comparison. Entered from the viewer with
// Edit (E); Done returns to viewing.

export type ComparisonComposeToolsProps = {
  comparison: ComparisonDetail;
  collectionId: string;
  onDone: () => void;
  onDeleted: () => void;
  /** The add-photos sheet is open — the viewer leaves the keyboard to it */
  onSheetOpenChange?: (open: boolean) => void;
};

const toolButton =
  "flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

export function ComparisonComposeTools({
  comparison,
  collectionId,
  onDone,
  onDeleted,
  onSheetOpenChange,
}: ComparisonComposeToolsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState(comparison.title ?? "");
  const [showFocal, setShowFocal] = useState(true);

  const members = comparison.members;
  const isCover = comparison.fitMode === "COVER";
  const { rowAspect } = comparisonShape(members);

  const run = useCallback(
    async (fn: () => Promise<{ success: boolean; error?: string }>) => {
      setBusy(true);
      try {
        const res = await fn();
        if (res.success) router.refresh();
        else toast.error(res.error ?? "Action failed");
        return res.success;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const commitTitle = () => {
    if ((title.trim() || null) === (comparison.title ?? null)) return;
    void run(() => setComparisonTitleAction(comparison.id, title, collectionId));
  };
  const setFit = (fitMode: ComparisonFitMode) => run(() => setComparisonFitModeAction(comparison.id, fitMode, collectionId));
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= members.length) return;
    const order = members.map((m) => m.mediaItemId);
    [order[index], order[target]] = [order[target], order[index]];
    void run(() => reorderComparisonItemsAction(comparison.id, order, collectionId));
  };
  const removeMember = (mediaItemId: string) => {
    if (members.length <= 2) {
      toast.error("A comparison needs at least 2 photos");
      return;
    }
    void run(() => removeComparisonItemAction(comparison.id, mediaItemId, collectionId));
  };
  const onDelete = async () => {
    if (!confirm("Delete this comparison?")) return;
    if (await run(() => deleteComparisonAction(comparison.id, collectionId))) onDeleted();
  };
  const openAdd = (open: boolean) => {
    setAddOpen(open);
    onSheetOpenChange?.(open);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="Untitled comparison"
          aria-label="Comparison title"
          className="min-w-[12rem] flex-1 rounded border border-white/15 bg-white/5 px-2 py-1 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none sm:max-w-xs"
        />
        <div className="flex gap-0.5 rounded-md border border-white/15 bg-white/5 p-0.5" role="group" aria-label="Fit">
          {([["COVER", "Fill", Crop], ["CONTAIN", "Fit", Maximize2]] as const).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => setFit(m)}
              aria-pressed={comparison.fitMode === m}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                comparison.fitMode === m ? "bg-white text-black" : "text-white/70 hover:text-white",
              )}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
        {isCover && (
          <button
            type="button"
            onClick={() => setShowFocal((v) => !v)}
            aria-pressed={showFocal}
            title={showFocal ? "Hide focal points" : "Show focal points (click a photo to set)"}
            className={cn(toolButton, showFocal && "bg-white text-black hover:bg-white hover:text-black")}
          >
            <Crosshair size={12} /> Focal
          </button>
        )}
        <button type="button" onClick={() => openAdd(true)} className={toolButton}>
          <Plus size={13} /> Add photos
        </button>
        <button type="button" onClick={onDelete} disabled={busy} className={cn(toolButton, "hover:border-red-400/50 hover:text-red-300")}>
          <Trash2 size={13} /> Delete
        </button>
        <button
          type="button"
          onClick={() => {
            commitTitle();
            onDone();
          }}
          className="ml-auto flex items-center gap-1 rounded-md bg-white px-3 py-1 text-xs font-semibold text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <Check size={13} /> Done
        </button>
      </div>
      {isCover && showFocal && (
        <p className="text-[11px] text-white/60">
          Fill: click a photo to set its focal point (what stays centred). ⚓ picks whose shape every cell takes.
        </p>
      )}

      <ComparisonFitStage aspect={rowAspect}>
        <ComparisonComposite
          members={members}
          fitMode={comparison.fitMode}
          source="view"
          className={cn(isCover && showFocal && "cursor-crosshair")}
          onCellClick={(m, e) => {
            if (!isCover || !showFocal) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            void run(() => setComparisonItemFocalAction(comparison.id, m.mediaItemId, x, y, collectionId));
          }}
          cellOverlay={(m, i) => (
            <>
              {isCover && showFocal && (
                <span
                  className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary/80 shadow"
                  style={{ left: `${(m.focalX ?? 0.5) * 100}%`, top: `${(m.focalY ?? 0.5) * 100}%` }}
                />
              )}
              <div className="absolute right-1 top-1 flex gap-0.5">
                <button
                  type="button"
                  title={m.isAspectDriver ? "Aspect-driver" : "Use as aspect-driver"}
                  aria-label={m.isAspectDriver ? "Aspect-driver" : "Use as aspect-driver"}
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    void run(() => setComparisonAspectDriverAction(comparison.id, m.mediaItemId, collectionId));
                  }}
                  className={cn("rounded p-1 backdrop-blur-sm", m.isAspectDriver ? "bg-amber-400 text-black" : "bg-black/55 text-white/80 hover:text-amber-300")}
                >
                  <Anchor size={12} />
                </button>
                <button
                  type="button"
                  title="Remove from comparison"
                  aria-label="Remove from comparison"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMember(m.mediaItemId);
                  }}
                  className="rounded bg-black/55 p-1 text-white/80 backdrop-blur-sm hover:text-red-300"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-[11px] text-white/80">
                <span>
                  {i === 0 ? "Before" : i === members.length - 1 ? "After" : `#${i + 1}`}
                  {m.isAspectDriver && <span className="ml-1 text-amber-400">⚓</span>}
                </span>
                <span className="flex">
                  <button
                    type="button"
                    disabled={busy || i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      move(i, -1);
                    }}
                    title="Move earlier"
                    aria-label="Move earlier"
                    className="rounded p-0.5 hover:text-white disabled:opacity-30"
                  >
                    <ArrowLeft size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={busy || i === members.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      move(i, 1);
                    }}
                    title="Move later"
                    aria-label="Move later"
                    className="rounded p-0.5 hover:text-white disabled:opacity-30"
                  >
                    <ArrowRight size={13} />
                  </button>
                </span>
              </div>
            </>
          )}
        />
      </ComparisonFitStage>

      <ComparisonBuilderSheet collectionId={collectionId} comparisonId={comparison.id} open={addOpen} onOpenChange={openAdd} />
    </div>
  );
}
