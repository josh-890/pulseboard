"use client";

import Link from "next/link";
import NextImage from "next/image";
import { Film, Image as ImageIcon } from "lucide-react";
import { cn, formatPartialDate } from "@/lib/utils";
import type { StagingWorkHistoryItem } from "@/lib/types";
import type { ArchiveStatus } from "@/generated/prisma/client";

function archiveDotClass(status: ArchiveStatus | null): string {
  if (!status || status === "UNKNOWN") return "bg-slate-400";
  if (status === "OK") return "bg-emerald-500";
  if (status === "MISSING") return "bg-red-500";
  return "bg-amber-500"; // PENDING, CHANGED, INCOMPLETE
}

type StagingWorkCardProps = {
  entry: StagingWorkHistoryItem;
};

export function StagingWorkCard({ entry }: StagingWorkCardProps) {
  const year = entry.releaseDate
    ? new Date(entry.releaseDate).getFullYear()
    : null;

  const dateLabel = entry.releaseDate
    ? formatPartialDate(entry.releaseDate, entry.releaseDatePrecision)
    : "Date unknown";

  return (
    <div className="rounded-2xl border border-white/15 bg-card/40 p-4 shadow-sm backdrop-blur-sm opacity-80">
      <div className="flex items-start gap-3">
        {/* Cover image or type icon */}
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-muted/30">
          {entry.coverImageUrl ? (
            <NextImage
              src={entry.coverImageUrl}
              alt={entry.title}
              fill
              className="object-cover"
              sizes="56px"
            />
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
                {year && <span className="ml-1.5 text-muted-foreground/70">· {dateLabel}</span>}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {/* Archive status dot */}
              <span
                className={cn("h-2 w-2 rounded-full", archiveDotClass(entry.archiveStatus))}
                title={entry.archiveStatus ?? "Archive status unknown"}
                aria-label={`Archive status: ${entry.archiveStatus ?? "unknown"}`}
              />
              {/* STAGED badge */}
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Staged
              </span>
            </div>
          </div>

          {entry.externalId && (
            <p className="mt-1 text-xs text-muted-foreground/60">ID: {entry.externalId}</p>
          )}

          <Link
            href="/staging-sets"
            className="mt-2 inline text-xs text-primary/70 underline-offset-2 hover:text-primary hover:underline"
          >
            View in staging workspace →
          </Link>
        </div>
      </div>
    </div>
  );
}
