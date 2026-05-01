"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Camera, Film, Merge, AlertTriangle, CheckCircle, Loader2, Archive } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn, formatPartialDateISO } from "@/lib/utils";
import { getSetMergeCandidatesAction, mergeSetAction } from "@/lib/actions/set-actions";

type Candidate = {
  id: string;
  title: string;
  channelName: string | null;
  releaseDate: Date | null;
  mediaCount: number;
  similarity: number;
};

type MergeSetSheetProps = {
  setId: string;
  setTitle: string;
  setType: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MergeSetSheet({ setId, setTitle, setType, open, onOpenChange }: MergeSetSheetProps) {
  const router = useRouter();
  // null = not yet fetched (loading), [] = fetched with 0 results
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!open) return;
    getSetMergeCandidatesAction(setId).then((res) => {
      setCandidates(res);
    });
  }, [open, setId]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSelected(null);
      setCandidates(null);
    }
    onOpenChange(next);
  }

  const loading = candidates === null;

  async function handleMerge() {
    if (!selected) return;
    setMerging(true);
    const result = await mergeSetAction(setId, selected.id);
    setMerging(false);
    if (result.success) {
      toast.success(result.message);
      onOpenChange(false);
      router.push(`/sets/${result.survivingId}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const isPhoto = setType === "photo";
  const TypeIcon = isPhoto ? Camera : Film;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Merge size={18} />
            Merge Duplicate Set
          </SheetTitle>
          <SheetDescription>
            Select the duplicate to merge into this set. The set with more data (media, confirmed
            archive, complete status) will automatically survive.
          </SheetDescription>
        </SheetHeader>

        {/* Info banner */}
        <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm">
          <div className="flex gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <p className="font-medium text-amber-600 dark:text-amber-400">Merging is permanent</p>
              <p className="mt-0.5 text-muted-foreground">
                The absorbed set will be deleted. All its media, credits, and staging references will
                be transferred to the survivor.
              </p>
            </div>
          </div>
        </div>

        {/* Current set */}
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          This set
        </div>
        <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-white/10 bg-card/60 px-3 py-2.5">
          <TypeIcon size={14} className="shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{setTitle}</span>
        </div>

        {selected ? (
          /* Confirmation state */
          <div className="space-y-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Will be merged with
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5">
              <CheckCircle size={14} className="shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{selected.title}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.channelName} · {selected.mediaCount} media
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              The system will automatically keep the set with more data as the survivor. Credits will
              be deduplicated, sessions merged, and staging references updated.
            </p>

            <div className="flex gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => setSelected(null)}
                disabled={merging}
              >
                Back
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={merging}
                onClick={handleMerge}
              >
                {merging && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                Confirm Merge
              </Button>
            </div>
          </div>
        ) : (
          /* Candidate list */
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Similar sets {candidates !== null && candidates.length > 0 && `(${candidates.length})`}
            </div>
            {loading && (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 size={16} className="mr-2 animate-spin" />
                Finding candidates…
              </div>
            )}
            {!loading && candidates !== null && candidates.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No similar sets found.
              </p>
            )}
            {!loading && candidates !== null && candidates.map((c) => {
              const simPct = Math.round(c.similarity * 100);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c)}
                  className={cn(
                    "w-full rounded-lg border border-transparent px-3 py-2.5 text-left",
                    "transition-all hover:border-white/15 hover:bg-card/60",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium leading-snug">{c.title}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        simPct >= 90
                          ? "bg-green-500/15 text-green-600 dark:text-green-400"
                          : simPct >= 70
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {simPct}%
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {c.channelName && <span>{c.channelName}</span>}
                    {c.releaseDate && (
                      <span>{formatPartialDateISO(c.releaseDate, "DAY")}</span>
                    )}
                    {c.mediaCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Camera size={9} />
                        {c.mediaCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

type MergeSetButtonProps = {
  setId: string;
  setTitle: string;
  setType: string;
};

export function MergeSetButton({ setId, setTitle, setType }: MergeSetButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Archive size={14} />
        Merge duplicate…
      </Button>
      <MergeSetSheet
        setId={setId}
        setTitle={setTitle}
        setType={setType}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
