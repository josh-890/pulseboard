"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Columns2, ImageIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ComparisonBuilderSheet } from "@/components/collections/comparison-builder-sheet";
import type { ComparisonSummary } from "@/lib/services/comparison-service";

/** A small montage of a comparison's members (up to 4 thumbs; +N overlay beyond). */
function Montage({ members }: { members: ComparisonSummary["members"] }) {
  const shown = members.slice(0, 4);
  const extra = members.length - shown.length;
  const cols = shown.length <= 1 ? 1 : 2;
  return (
    <div
      className={cn("grid h-full w-full gap-0.5 bg-black/40", cols === 1 ? "grid-cols-1" : "grid-cols-2")}
    >
      {shown.map((m, i) => (
        <div key={m.mediaItemId} className="relative min-h-0 overflow-hidden">
          {m.thumbUrl ? (
            <Image src={m.thumbUrl} alt="" fill unoptimized className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <ImageIcon size={18} className="text-muted-foreground/40" />
            </div>
          )}
          {extra > 0 && i === shown.length - 1 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-semibold text-white">
              +{extra}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ComparisonCollectionView({
  collectionId,
  comparisons,
}: {
  collectionId: string;
  comparisons: ComparisonSummary[];
}) {
  const [builderOpen, setBuilderOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {comparisons.length} comparison{comparisons.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" className="gap-1.5" onClick={() => setBuilderOpen(true)}>
          <Plus size={14} /> New comparison
        </Button>
      </div>

      {comparisons.length === 0 ? (
        <div className="rounded-2xl border border-white/20 bg-card/70 p-12 text-center shadow-md backdrop-blur-sm">
          <Columns2 size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="mb-4 text-sm text-muted-foreground">
            No comparisons yet. Create one from two or more photos.
          </p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBuilderOpen(true)}>
            <Plus size={14} /> New comparison
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {comparisons.map((c) => (
            <Link
              key={c.id}
              href={`/collections/${collectionId}/comparison/${c.id}`}
              className="group overflow-hidden rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm transition-colors hover:border-amber-500/40"
            >
              <div className="relative aspect-[4/3]">
                <Montage members={c.members} />
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                  <Columns2 size={10} /> {c.memberCount}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <ComparisonBuilderSheet collectionId={collectionId} open={builderOpen} onOpenChange={setBuilderOpen} />
    </div>
  );
}
