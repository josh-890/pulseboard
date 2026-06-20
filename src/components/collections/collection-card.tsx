"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImageIcon, User, Globe, Columns2, MoreVertical, Star, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DeleteButton } from "@/components/shared/delete-button";
import { EditCollectionDialog } from "@/components/collections/edit-collection-dialog";
import {
  setTargetCollectionAction,
  deleteCollectionAction,
} from "@/lib/actions/collection-actions";
import type { CollectionSummary } from "@/lib/services/collection-service";
import { cn } from "@/lib/utils";

export function CollectionCard({ collection: c }: { collection: CollectionSummary }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggleTarget(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    setBusy(true);
    const res = await setTargetCollectionAction(c.isTarget ? null : c.id);
    setBusy(false);
    if (res.success) {
      toast.success(c.isTarget ? "Cleared quick-add target" : "Set as quick-add target");
      router.refresh();
    } else {
      toast.error(res.error ?? "Failed");
    }
  }

  return (
    <div className="group relative rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm transition-all hover:border-white/30 hover:shadow-lg">
      <Link
        href={`/collections/${c.id}`}
        className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Thumbnail */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-t-2xl bg-muted">
          {c.thumbnailUrl ? (
            <Image
              src={c.thumbnailUrl}
              alt={c.name}
              fill
              className="object-cover transition-transform group-hover:scale-105"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon size={32} className="text-muted-foreground/40" />
            </div>
          )}

          {/* Top-left badge cluster: type, before/after, target */}
          <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1">
            {c.personId ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-600 backdrop-blur-sm dark:text-sky-400">
                <User size={10} />
                Person
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 backdrop-blur-sm dark:text-emerald-400">
                <Globe size={10} />
                Global
              </span>
            )}
            {c.layout === "SIDE_BY_SIDE" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 backdrop-blur-sm dark:text-amber-400">
                <Columns2 size={10} />
                Before / after
              </span>
            )}
            {c.isTarget && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/20 px-2 py-0.5 text-[10px] font-medium text-amber-400 backdrop-blur-sm">
                <Star size={10} fill="currentColor" />
                Target
              </span>
            )}
          </div>

          {/* Item count */}
          <div className="absolute bottom-2 right-2">
            <span className="inline-flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              <ImageIcon size={10} />
              {c.itemCount}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="p-4">
          <h3 className="font-semibold leading-tight transition-colors group-hover:text-primary">
            {c.name}
          </h3>
          {c.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
          )}
          {c.personName && (
            <p className="mt-1.5 text-xs text-muted-foreground">{c.personName}</p>
          )}
        </div>
      </Link>

      {/* Hover quick-actions menu (top-right) */}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Collection actions"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            className={cn(
              "absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-opacity hover:bg-black/70 focus-visible:opacity-100",
              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <MoreVertical size={14} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={toggleTarget}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/10"
          >
            <Star size={14} className={c.isTarget ? "text-amber-400" : ""} fill={c.isTarget ? "currentColor" : "none"} />
            {c.isTarget ? "Clear quick-add target" : "Set as quick-add target"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              setEditOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/10"
          >
            <Pencil size={14} />
            Edit
          </button>
          <div className="px-1 pt-1">
            <DeleteButton
              title="Delete collection?"
              description="This will permanently remove the collection. Media items will not be deleted."
              onDelete={deleteCollectionAction.bind(null, c.id)}
            />
          </div>
        </PopoverContent>
      </Popover>

      <EditCollectionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        collectionId={c.id}
        name={c.name}
        description={c.description}
        layout={c.layout}
      />
    </div>
  );
}
