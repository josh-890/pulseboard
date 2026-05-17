"use client";

import Link from "next/link";
import NextImage from "next/image";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Film, FolderCheck, FolderOpen, FolderX, Image as ImageIcon } from "lucide-react";
import { formatPartialDate } from "@/lib/utils";
import type { StagingWorkHistoryItem } from "@/lib/types";
import type { ArchiveStatus } from "@/generated/prisma/client";

function ArchivePill({
  archiveStatus,
  archiveFileCount,
  hasSuggestion,
}: {
  archiveStatus: ArchiveStatus | null;
  archiveFileCount: number | null;
  hasSuggestion: boolean;
}) {
  if (archiveStatus === "OK") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[11px] text-green-600 dark:text-green-400">
        <FolderCheck size={11} />
        In archive{archiveFileCount != null ? ` · ${archiveFileCount} files` : ""}
      </span>
    );
  }
  if (hasSuggestion) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
        <FolderOpen size={11} />
        Match suggested
      </span>
    );
  }
  if (archiveStatus === "MISSING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-600 dark:text-red-400">
        <FolderX size={11} />
        Missing from archive
      </span>
    );
  }
  if (archiveStatus === "CHANGED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
        <FolderCheck size={11} />
        Archive changed
      </span>
    );
  }
  if (archiveStatus === "INCOMPLETE") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[11px] text-orange-600 dark:text-orange-400">
        <FolderX size={11} />
        Archive incomplete
      </span>
    );
  }
  return null;
}

type StagingWorkCardProps = {
  entry: StagingWorkHistoryItem;
};

export function StagingWorkCard({ entry }: StagingWorkCardProps) {
  const thumbRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const showPreview = useCallback(() => {
    if (!thumbRef.current || !entry.coverImageUrl) return;
    const rect = thumbRef.current.getBoundingClientRect();
    const maxTop = window.innerHeight - 420;
    setPos({ top: Math.min(rect.top, Math.max(8, maxTop)), left: rect.right + 8 });
    setHover(true);
  }, [entry.coverImageUrl]);

  const hidePreview = useCallback(() => setHover(false), []);

  const dateLabel = entry.releaseDate
    ? formatPartialDate(entry.releaseDate, entry.releaseDatePrecision)
    : "Date unknown";

  return (
    <div className="rounded-2xl border border-white/15 bg-card/40 p-4 shadow-sm backdrop-blur-sm opacity-80">
      <div className="flex items-start gap-3">
        {/* Cover image or type icon */}
        <div
          ref={thumbRef}
          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-muted/30"
          onMouseEnter={showPreview}
          onMouseLeave={hidePreview}
        >
          {entry.coverImageUrl ? (
            <>
              <NextImage
                src={entry.coverImageUrl}
                alt={entry.title}
                fill
                unoptimized
                className="object-cover"
              />
              {hover && pos && createPortal(
                <div
                  className="pointer-events-none fixed z-[100] overflow-hidden rounded-lg border border-border bg-background shadow-xl"
                  style={{ top: pos.top, left: pos.left }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.coverImageUrl}
                    alt={entry.title}
                    className="block max-h-[400px] max-w-[300px]"
                  />
                </div>,
                document.body,
              )}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {entry.isVideo ? (
                <Film size={20} className="text-muted-foreground/60" aria-hidden="true" />
              ) : (
                <ImageIcon size={20} className="text-muted-foreground/60" aria-hidden="true" />
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-snug">{entry.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {entry.channelName}
                {entry.releaseDate && (
                  <span className="ml-1.5 text-muted-foreground/70">· {dateLabel}</span>
                )}
              </p>
            </div>
            {/* STAGED badge */}
            <span className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
              Staged
            </span>
          </div>

          {/* Archive status pill — same style as set hero */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ArchivePill
              archiveStatus={entry.archiveStatus}
              archiveFileCount={entry.archiveFileCount}
              hasSuggestion={entry.hasSuggestion}
            />
            {entry.externalId && (
              <span className="text-[11px] text-muted-foreground/60 font-mono">
                ID: {entry.externalId}
              </span>
            )}
          </div>

          <Link
            href="/staging-sets"
            className="mt-1.5 inline text-xs text-primary/70 underline-offset-2 hover:text-primary hover:underline"
          >
            View in staging workspace →
          </Link>
        </div>
      </div>
    </div>
  );
}
