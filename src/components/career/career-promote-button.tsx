"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { StagingSetPromotePreview } from "@/lib/services/import/import-executor";
import type { UndevelopedParticipant } from "@/lib/services/import/staging-cast-readiness";

// Promote an approved staged set straight from the Career tab (2026-10-18).
// Opening the popover asks the server what a promote would do right now — a
// new Set, or enrich an existing one — so the one click is never blind. The
// promote itself is the same route the staging workspace uses; afterwards the
// server-rendered timeline refreshes and the tile turns solid green in place.
//
// Safelock: from here a set promotes only when everyone in it is already a
// Person in the app. With anyone still new the button turns amber, the popover
// names them and Promote stays off — the staging workspace remains the way to
// promote such a set. The route enforces the same lock (requireDevelopedCast).

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
  /** Participants not yet a Person in the app, as the page rendered them */
  undevelopedParticipants: UndevelopedParticipant[];
  className?: string;
};

function participantLabel(p: UndevelopedParticipant): string {
  return p.icgId ? `${p.name} (${p.icgId})` : p.name;
}

export function CareerPromoteButton({
  stagingSetId,
  title,
  stagingHref,
  variant,
  undevelopedParticipants,
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireDevelopedCast: true }),
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

  // The preview's answer is fresher than the page — someone may have been
  // added to the app since it rendered — so it wins once it has arrived.
  const undeveloped =
    preview.phase === "ready" && preview.preview.kind !== "not-promotable"
      ? preview.preview.undevelopedParticipants
      : undevelopedParticipants;
  const castBlocked = undeveloped.length > 0;
  const canPromote =
    preview.phase === "ready" &&
    preview.preview.kind !== "not-promotable" &&
    !castBlocked &&
    !promoting;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            castBlocked
              ? `Promote ${title} — not everyone in it is in the app yet`
              : `Promote ${title}`
          }
          title={
            castBlocked
              ? `Not in the app yet: ${undeveloped.map(participantLabel).join(", ")}`
              : "Promote this approved set"
          }
          data-cast-blocked={castBlocked || undefined}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full font-medium transition-colors duration-150 motion-reduce:transition-none",
            "focus-visible:ring-primary/60 focus-visible:ring-2 focus-visible:outline-none",
            castBlocked
              ? variant === "tile"
                ? "bg-black/60 px-1.5 py-0.5 text-[10px] text-amber-300 backdrop-blur-sm hover:bg-amber-600 hover:text-white active:bg-amber-700"
                : "border border-amber-600/50 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 active:bg-amber-500/30 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/25 dark:hover:text-amber-100"
              : variant === "tile"
                ? "bg-black/60 px-1.5 py-0.5 text-[10px] text-emerald-300 backdrop-blur-sm hover:bg-emerald-600 hover:text-white active:bg-emerald-700"
                : "border border-emerald-600/40 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 active:bg-emerald-500/30 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/25 dark:hover:text-emerald-100",
            variant === "row" && "px-2 py-1 text-xs",
            variant === "compact" && "px-1.5 py-0.5 text-[10px]",
            open && (castBlocked ? "bg-amber-600 text-white" : "bg-emerald-600 text-white"),
            className,
          )}
        >
          {castBlocked ? (
            <AlertTriangle size={variant === "row" ? 13 : 11} aria-hidden />
          ) : (
            <ArrowUpCircle size={variant === "row" ? 13 : 11} aria-hidden />
          )}
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
          {castBlocked && preview.phase !== "error" && (
            <div
              role="alert"
              className="mt-2 rounded-md border border-amber-600/40 bg-amber-500/10 p-2 text-amber-900 dark:border-amber-500/40 dark:text-amber-200"
            >
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle size={12} aria-hidden />
                Not everyone in this set is in the app yet
              </p>
              <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5">
                {undeveloped.map((p) => (
                  <li key={`${p.name}|${p.icgId}`}>{participantLabel(p)}</li>
                ))}
              </ul>
              <p className="mt-1">
                Add them as people first — promoted now, they would only be
                credited, without a career. To promote anyway, use Staging Sets.
              </p>
            </div>
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
