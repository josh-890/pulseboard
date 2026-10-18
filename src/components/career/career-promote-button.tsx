"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { StagingSetPromotePreview } from "@/lib/services/import/import-executor";

// Promote an approved staged set straight from the Career tab (2026-10-18).
// Opening the popover asks the server what a promote would do right now — a
// new Set, or enrich an existing one — so the one click is never blind. The
// promote itself is the same route the staging workspace uses; afterwards the
// server-rendered timeline refreshes and the tile turns solid green in place.

type PreviewState =
  | { phase: "loading" }
  | { phase: "ready"; preview: StagingSetPromotePreview }
  | { phase: "error"; message: string };

export type CareerPromoteButtonProps = {
  stagingSetId: string;
  title: string;
  /** The staging workspace focused on this set — the "look closer" way out */
  stagingHref: string;
  /** tile = badge on a gallery cover; row = timeline row; compact = one-line row */
  variant: "tile" | "row" | "compact";
  className?: string;
};

export function CareerPromoteButton({
  stagingSetId,
  title,
  stagingHref,
  variant,
  className,
}: CareerPromoteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ phase: "loading" });
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  // Drops a preview answer that arrives after the popover was closed and reopened
  const requestSeq = useRef(0);

  async function loadPreview() {
    const seq = ++requestSeq.current;
    setPreview({ phase: "loading" });
    try {
      const res = await fetch(
        `/api/staging-sets/${stagingSetId}/promote-preview`,
      );
      const body = (await res.json()) as StagingSetPromotePreview;
      if (seq !== requestSeq.current) return;
      setPreview({ phase: "ready", preview: body });
    } catch {
      if (seq !== requestSeq.current) return;
      setPreview({
        phase: "error",
        message: "Could not check what a promote would do.",
      });
    }
  }

  function handleOpenChange(next: boolean) {
    if (promoting) return;
    setOpen(next);
    if (next) {
      setPromoteError(null);
      void loadPreview();
    }
  }

  async function handlePromote() {
    setPromoting(true);
    setPromoteError(null);
    try {
      const res = await fetch(`/api/staging-sets/${stagingSetId}/promote`, {
        method: "POST",
      });
      const result = (await res.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!result.success) {
        setPromoteError(result.error ?? "Promote failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setPromoteError("Promote failed — the server could not be reached.");
    } finally {
      setPromoting(false);
    }
  }

  const canPromote =
    preview.phase === "ready" &&
    preview.preview.kind !== "not-promotable" &&
    !promoting;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Promote ${title}`}
          title="Promote this approved set"
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full font-medium transition-colors duration-150 motion-reduce:transition-none",
            "focus-visible:ring-primary/60 focus-visible:ring-2 focus-visible:outline-none",
            variant === "tile"
              ? "bg-black/60 px-1.5 py-0.5 text-[10px] text-emerald-300 backdrop-blur-sm hover:bg-emerald-600 hover:text-white active:bg-emerald-700"
              : "border border-emerald-600/40 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 active:bg-emerald-500/30 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/25 dark:hover:text-emerald-100",
            variant === "row" && "px-2 py-1 text-xs",
            variant === "compact" && "px-1.5 py-0.5 text-[10px]",
            open && "bg-emerald-600 text-white",
            className,
          )}
        >
          <ArrowUpCircle size={variant === "row" ? 13 : 11} aria-hidden />
          Promote
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3 text-sm">
        <p className="truncate font-medium" title={title}>
          {title}
        </p>

        <div aria-live="polite" className="min-h-10 text-xs">
          {preview.phase === "loading" && (
            <p className="text-muted-foreground flex items-center gap-2">
              <Loader2
                size={12}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden
              />
              Checking what a promote would do…
            </p>
          )}
          {preview.phase === "error" && (
            <p className="text-red-400">{preview.message}</p>
          )}
          {preview.phase === "ready" &&
            preview.preview.kind === "create-new" && (
              <p className="text-muted-foreground">
                Creates a{" "}
                <span className="text-foreground font-medium">new set</span> —
                no existing set matches it.
              </p>
            )}
          {preview.phase === "ready" && preview.preview.kind === "enrich" && (
            <p className="text-muted-foreground">
              Adds to the existing set{" "}
              <Link
                href={`/sets/${preview.preview.matchedSetId}`}
                className="text-foreground font-medium underline-offset-2 hover:underline focus-visible:underline"
              >
                {preview.preview.matchedTitle}
              </Link>{" "}
              — no new set is created.
            </p>
          )}
          {preview.phase === "ready" &&
            preview.preview.kind === "not-promotable" && (
              <p className="text-amber-400">{preview.preview.reason}</p>
            )}
          {promoteError && <p className="mt-1 text-red-400">{promoteError}</p>}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={stagingHref}>Open in staging</Link>
          </Button>
          <Button size="sm" onClick={handlePromote} disabled={!canPromote}>
            {promoting ? (
              <Loader2
                size={14}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            ) : (
              <ArrowUpCircle size={14} aria-hidden />
            )}
            Promote
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
