"use client";

import { useState } from "react";
import { Camera, Film, FolderCheck, Link2, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FolderMatchCandidate, FolderMatchCheck, FolderMatchReason } from "@/lib/services/folder-match-service";

// The last check before a folder becomes a NEW staged set (2026-10-16): the staged
// sets it could already be, each with what it takes to decide at a glance — the
// cover next to the folder's own, title, channel, date, cast, image count, status
// and why it is listed. Clicking a cover compares the two large, side by side.

const REASON_LABEL: Record<FolderMatchReason, string> = {
  suggested: "Suggested",
  "same-title": "Same title",
  "similar-title": "Similar title",
  "same-date": "Same day",
  "near-date": "Near date",
  "same-channel": "Same channel",
  "same-person": "Same person",
};

const STATUS_CLASS: Record<string, string> = {
  PENDING: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  REVIEWING: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  APPROVED: "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  PROMOTED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

function Cover({
  url,
  isVideo,
  className,
  contain = false,
}: {
  url: string | null;
  isVideo: boolean;
  className?: string;
  /** Whole image, letterboxed — for the side-by-side comparison */
  contain?: boolean;
}) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-md bg-muted/40", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className={cn("h-full w-full", contain ? "object-contain" : "object-cover")} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
          {isVideo ? <Film size={20} /> : <Camera size={20} />}
        </div>
      )}
    </div>
  );
}

export type FolderMatchCandidatesProps = {
  check: FolderMatchCheck | null;
  loading: boolean;
  error: string | null;
  /** The candidate being linked right now */
  linkingId: string | null;
  disabled: boolean;
  onLink: (candidate: FolderMatchCandidate) => void;
};

export function FolderMatchCandidates({ check, loading, error, linkingId, disabled, onLink }: FolderMatchCandidatesProps) {
  const [compareId, setCompareId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-muted/20 p-3 text-xs text-muted-foreground" role="status">
        <Loader2 size={14} className="animate-spin" /> Checking for staged sets this folder could already be…
      </div>
    );
  }
  if (error) {
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive" role="alert">
        Could not check for existing staged sets: {error}
      </p>
    );
  }
  if (!check) return null;
  if (check.candidates.length === 0) {
    return (
      <p className="rounded-lg border border-white/15 bg-muted/20 p-3 text-xs text-muted-foreground">
        No staged set looks like this folder — a new one is the right call.
      </p>
    );
  }

  const { folder } = check;
  const compared = check.candidates.find((c) => c.id === compareId) ?? null;

  return (
    <section aria-labelledby="fm-title" className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <div>
        <h3 id="fm-title" className="text-sm font-semibold text-amber-700 dark:text-amber-400">
          Is it one of these?
        </h3>
        <p className="text-xs text-muted-foreground">
          {check.candidates.length} staged set{check.candidates.length === 1 ? "" : "s"} could already be this folder.
          Link it to the right one — or create a new set below. Click a cover to compare.
        </p>
      </div>

      {/* The folder itself — what every candidate is held against */}
      <div className="flex items-center gap-3 rounded-md border border-white/15 bg-background/40 p-2">
        <Cover url={folder.coverUrl} isVideo={folder.isVideo} className="aspect-[2/3] w-14" />
        <div className="min-w-0 text-xs">
          <p className="font-medium text-foreground">This folder</p>
          <p className="truncate text-muted-foreground" title={folder.folderName}>{folder.folderName}</p>
          <p className="text-muted-foreground">
            {folder.releaseDate ?? "Undated"}
            {folder.fileCount !== null && ` · ${folder.fileCount} files`}
          </p>
        </div>
      </div>

      {/* Side by side, large */}
      {compared && (
        <div className="relative grid grid-cols-2 gap-2 rounded-md border border-white/15 bg-background/60 p-2">
          <button
            type="button"
            onClick={() => setCompareId(null)}
            className="absolute right-1 top-1 z-10 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close comparison"
          >
            <X size={12} />
          </button>
          <figure className="space-y-1">
            <Cover url={folder.coverUrl} isVideo={folder.isVideo} contain className="h-72 w-full" />
            <figcaption className="truncate text-center text-[11px] text-muted-foreground">This folder</figcaption>
          </figure>
          <figure className="space-y-1">
            <Cover url={compared.coverUrl} isVideo={compared.isVideo} contain className="h-72 w-full" />
            <figcaption className="truncate text-center text-[11px] text-muted-foreground">{compared.title}</figcaption>
          </figure>
        </div>
      )}

      <ul className="space-y-2">
        {check.candidates.map((c) => {
          const blocked = c.linkedFolderName !== null;
          return (
            <li
              key={c.id}
              className={cn(
                "flex gap-3 rounded-md border bg-background/40 p-2 transition-colors",
                compareId === c.id ? "border-primary/60" : "border-white/15",
                blocked && "opacity-70",
              )}
            >
              <button
                type="button"
                onClick={() => setCompareId((id) => (id === c.id ? null : c.id))}
                className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Compare the cover of ${c.title} with this folder`}
                aria-pressed={compareId === c.id}
              >
                <Cover url={c.coverUrl} isVideo={c.isVideo} className="aspect-[2/3] w-20 hover:opacity-90" />
              </button>

              <div className="min-w-0 flex-1 space-y-1 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-medium text-foreground">{c.title}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                      STATUS_CLASS[c.status] ?? "border-white/20 text-muted-foreground",
                    )}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {c.channelName} · {c.releaseDate ?? "Undated"}
                  {c.dayDistance !== null && c.dayDistance > 0 && ` (${c.dayDistance} day${c.dayDistance === 1 ? "" : "s"} apart)`}
                  {c.imageCount !== null && ` · ${c.imageCount} images`}
                  {c.isVideo !== folder.isVideo && ` · ${c.isVideo ? "video" : "photo"} set`}
                </p>
                <p className="text-muted-foreground">
                  {c.participants.length > 0 ? c.participants.join(", ") : "No cast"}
                  {" · "}
                  {c.fromImport ? "imported" : "added by hand"}
                  {c.externalId && ` · ID ${c.externalId}`}
                </p>
                <div className="flex flex-wrap gap-1">
                  {c.reasons.map((r) => (
                    <span
                      key={r}
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        r === "suggested" ? "bg-violet-500/15 text-violet-600 dark:text-violet-400" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {REASON_LABEL[r]}
                    </span>
                  ))}
                </div>
                {blocked ? (
                  <p className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <FolderCheck size={12} aria-hidden />
                    Already has its folder: <span className="truncate" title={c.linkedFolderName ?? ""}>{c.linkedFolderName}</span>
                  </p>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={disabled}
                    onClick={() => onLink(c)}
                  >
                    {linkingId === c.id ? (
                      <Loader2 size={12} className="mr-1 animate-spin" />
                    ) : (
                      <Link2 size={12} className="mr-1" />
                    )}
                    {c.promotedSetId ? "Link folder to its set" : "Link folder to this set"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
