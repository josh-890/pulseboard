"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Columns2, GitMerge, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { mergeSessionsOldestSurvives } from "@/lib/actions/session-actions";
import { afterwards } from "@/lib/session-merge-text";
import type { GalleryItem, SessionMergeCard } from "@/lib/types";
import { cn } from "@/lib/utils";

// The foot of the compare page (2026-10-20): the photos pinned for the loupe,
// what the merged session will hold, and the merge itself — confirmed once more,
// since the other session is deleted.

export type MergeConfirmBarProps = {
  survivor: SessionMergeCard;
  absorbed: SessionMergeCard;
  pinned: { stays: GalleryItem | null; goes: GalleryItem | null };
  onUnpin: (side: "stays" | "goes") => void;
  onCompare: () => void;
};

function PinSlot({ photo, side, onUnpin }: { photo: GalleryItem | null; side: "stays" | "goes"; onUnpin: () => void }) {
  const label = side === "stays" ? "Left" : "Right";
  return (
    <div
      className={cn(
        "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border text-[10px] text-muted-foreground",
        photo ? "border-indigo-400/60" : "border-dashed border-border",
      )}
      title={photo ? `${label}: ${photo.filename}` : `${label}: pin a photo of the ${side === "stays" ? "left" : "right"} session`}
    >
      {photo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.urls.gallery_512 ?? photo.urls.original} alt={`${label} pinned photo`} className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={onUnpin}
            aria-label={`Unpin ${label.toLowerCase()} photo`}
            className="absolute right-0 top-0 rounded-bl bg-black/60 p-0.5 text-white hover:bg-black/80"
          >
            <X size={10} aria-hidden="true" />
          </button>
        </>
      ) : (
        label
      )}
    </div>
  );
}

export function MergeConfirmBar({ survivor, absorbed, pinned, onUnpin, onCompare }: MergeConfirmBarProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);
  const canCompare = !!pinned.stays && !!pinned.goes;

  async function handleMerge() {
    setMerging(true);
    const result = await mergeSessionsOldestSurvives(survivor.id, absorbed.id).catch(() => ({
      success: false as const,
      error: "Merge failed — please try again",
    }));
    if (!result.success) {
      setMerging(false);
      setConfirming(false);
      toast.error(result.error);
      return;
    }
    toast.success("Sessions merged");
    router.push(`/sessions/${result.survivorId}`);
  }

  return (
    <div className="sticky bottom-0 z-30 -mx-1 rounded-t-2xl border border-white/20 bg-card/90 px-3 py-2.5 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-card/95">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5" aria-label="Pinned to compare">
          <PinSlot photo={pinned.stays} side="stays" onUnpin={() => onUnpin("stays")} />
          <PinSlot photo={pinned.goes} side="goes" onUnpin={() => onUnpin("goes")} />
          <Button
            variant="outline"
            size="sm"
            onClick={onCompare}
            disabled={!canCompare}
            title={canCompare ? "Compare the two pinned photos" : "Pin one photo on each side first"}
          >
            <Columns2 size={14} aria-hidden="true" /> Compare
          </Button>
        </div>

        <div className="min-w-0 flex-1 text-xs">
          <p className="font-medium">Afterwards: {afterwards(survivor, absorbed)}</p>
          <p className="truncate text-muted-foreground">
            Name, label and description stay those of &ldquo;{survivor.name}&rdquo;.
          </p>
        </div>

        <Button variant="destructive" onClick={() => setConfirming(true)} disabled={merging}>
          <GitMerge size={14} aria-hidden="true" /> Merge sessions
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={(o) => !merging && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge into &ldquo;{survivor.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The photos, people and sets of &ldquo;{absorbed.name}&rdquo; move into the older session, and
              &ldquo;{absorbed.name}&rdquo; is deleted. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleMerge();
              }}
              disabled={merging}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {merging && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {merging ? "Merging…" : "Merge sessions"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
