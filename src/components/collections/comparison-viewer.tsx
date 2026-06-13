"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Columns2, SlidersHorizontal, Crop, Maximize2, Anchor, ArrowLeft, ArrowRight, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageCompareSlider } from "@/components/collections/image-compare-slider";
import { ComparisonBuilderSheet } from "@/components/collections/comparison-builder-sheet";
import {
  setComparisonFitModeAction,
  setComparisonAspectDriverAction,
  setComparisonItemFocalAction,
  reorderComparisonItemsAction,
  removeComparisonItemAction,
  deleteComparisonAction,
} from "@/lib/actions/comparison-actions";
import type { ComparisonDetail, ComparisonFitMode } from "@/lib/services/comparison-service";

export function ComparisonViewer({
  comparison,
  collectionId,
  collectionName,
}: {
  comparison: ComparisonDetail;
  collectionId: string;
  collectionName: string;
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"row" | "slider">("row");
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const members = comparison.members;
  const driver = members.find((m) => m.isAspectDriver) ?? members[0];
  const aspectW = driver?.originalWidth || 2;
  const aspectH = driver?.originalHeight || 3;
  const isCover = comparison.fitMode === "COVER";
  const canSlider = members.length === 2;
  const showSlider = canSlider && viewMode === "slider";

  const run = useCallback(async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res.success) router.refresh();
      else toast.error(res.error ?? "Action failed");
    } finally {
      setBusy(false);
    }
  }, [router]);

  const setFit = (fitMode: ComparisonFitMode) => run(() => setComparisonFitModeAction(comparison.id, fitMode, collectionId));
  const setDriver = (mediaItemId: string) => run(() => setComparisonAspectDriverAction(comparison.id, mediaItemId, collectionId));
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= members.length) return;
    const order = members.map((m) => m.mediaItemId);
    [order[index], order[target]] = [order[target], order[index]];
    return run(() => reorderComparisonItemsAction(comparison.id, order, collectionId));
  };
  const removeMember = (mediaItemId: string) => {
    if (members.length <= 2) { toast.error("A comparison needs at least 2 photos"); return; }
    void run(() => removeComparisonItemAction(comparison.id, mediaItemId, collectionId));
  };
  const setFocalFromClick = (mediaItemId: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!isCover) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    void run(() => setComparisonItemFocalAction(comparison.id, mediaItemId, x, y, collectionId));
  };
  const onDelete = () => {
    if (!confirm("Delete this comparison?")) return;
    void run(async () => {
      const res = await deleteComparisonAction(comparison.id, collectionId);
      if (res.success) router.push(`/collections/${collectionId}`);
      return res;
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/collections/${collectionId}`} className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft size={15} /> {collectionName}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold leading-tight">Comparison · {members.length} photos</h1>
          <div className="flex flex-wrap items-center gap-2">
            {/* Fit mode */}
            <div className="flex gap-0.5 rounded-md border border-white/15 bg-background/60 p-0.5">
              {([["COVER", "Fill", Crop], ["CONTAIN", "Fit", Maximize2]] as const).map(([m, label, Icon]) => (
                <button key={m} type="button" disabled={busy} onClick={() => setFit(m)}
                  className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                    comparison.fitMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
            {/* View mode (pairs) */}
            {canSlider && (
              <div className="flex gap-0.5 rounded-md border border-white/15 bg-background/60 p-0.5">
                {([["row", "Side by side", Columns2], ["slider", "Slider", SlidersHorizontal]] as const).map(([m, label, Icon]) => (
                  <button key={m} type="button" onClick={() => setViewMode(m)}
                    className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                      viewMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setAddOpen(true)} className="flex items-center gap-1 rounded-md border border-white/15 bg-card/60 px-2 py-1 text-xs hover:border-primary/40 hover:text-primary">
              <Plus size={13} /> Add photos
            </button>
            <button type="button" onClick={onDelete} className="flex items-center gap-1 rounded-md border border-white/15 bg-card/60 px-2 py-1 text-xs text-muted-foreground hover:border-destructive/40 hover:text-destructive">
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>
        {isCover && !showSlider && (
          <p className="mt-1 text-[11px] text-muted-foreground">Fill mode: click a photo to set its focal point (what stays centred). Use the ⚓ to pick which photo&rsquo;s shape governs the cells.</p>
        )}
      </div>

      {showSlider ? (
        <ImageCompareSlider
          beforeUrl={members[0].viewUrl ?? ""}
          afterUrl={members[1].viewUrl ?? ""}
          aspectW={aspectW}
          aspectH={aspectH}
          fit={isCover ? "cover" : "contain"}
          beforeFocal={members[0].focalX != null && members[0].focalY != null ? { x: members[0].focalX, y: members[0].focalY } : null}
          afterFocal={members[1].focalX != null && members[1].focalY != null ? { x: members[1].focalX, y: members[1].focalY } : null}
          beforeLabel="Before"
          afterLabel="After"
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {members.map((m, i) => {
            const fx = m.focalX ?? 0.5;
            const fy = m.focalY ?? 0.5;
            return (
              <figure key={m.mediaItemId} className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                <div
                  onClick={(e) => setFocalFromClick(m.mediaItemId, e)}
                  className={cn(
                    "group relative w-full overflow-hidden rounded-lg border border-white/10 bg-black/50",
                    isCover && "cursor-crosshair",
                  )}
                  style={{ aspectRatio: `${aspectW} / ${aspectH}` }}
                >
                  {m.viewUrl ? (
                    <Image
                      src={m.viewUrl}
                      alt={`Photo ${i + 1}`}
                      fill
                      unoptimized
                      className={isCover ? "object-cover" : "object-contain"}
                      style={isCover ? { objectPosition: `${fx * 100}% ${fy * 100}%` } : undefined}
                    />
                  ) : null}

                  {/* Focal dot (cover only) */}
                  {isCover && (
                    <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary/80 shadow"
                      style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }} />
                  )}

                  {/* Controls */}
                  <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button type="button" title={m.isAspectDriver ? "Aspect-driver" : "Use as aspect-driver"} disabled={busy}
                      onClick={(e) => { e.stopPropagation(); setDriver(m.mediaItemId); }}
                      className={cn("rounded p-1 backdrop-blur-sm", m.isAspectDriver ? "bg-amber-400 text-black" : "bg-black/55 text-white/80 hover:text-amber-300")}>
                      <Anchor size={12} />
                    </button>
                    <button type="button" title="Remove" disabled={busy}
                      onClick={(e) => { e.stopPropagation(); removeMember(m.mediaItemId); }}
                      className="rounded bg-black/55 p-1 text-white/80 backdrop-blur-sm hover:text-destructive">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <figcaption className="flex items-center justify-between gap-1">
                  <span className="truncate text-xs text-muted-foreground">
                    {i === 0 ? "Before" : i === members.length - 1 ? "After" : `#${i + 1}`}
                    {m.isAspectDriver && <span className="ml-1 text-amber-500">⚓</span>}
                  </span>
                  <span className="flex shrink-0">
                    <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} title="Move earlier" aria-label="Move earlier"
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowLeft size={13} /></button>
                    <button type="button" disabled={busy || i === members.length - 1} onClick={() => move(i, 1)} title="Move later" aria-label="Move later"
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowRight size={13} /></button>
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}

      <ComparisonBuilderSheet collectionId={collectionId} comparisonId={comparison.id} open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
