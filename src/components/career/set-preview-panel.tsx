"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Camera, Film } from "lucide-react";
import { cn, getInitialsFromName } from "@/lib/utils";
import type { CareerHoverPreviewData } from "@/lib/services/career-service";

// Persistent right-panel preview for the Career timeline. Same content
// shape as the legacy `SetHoverPreview` popover, but laid out for a
// vertical 360px-wide sticky column rather than a floating popover.
//
// Sections (top → bottom):
//   1. Header  — set title + 'Back to summary' chip
//   2. Cover   — large hero
//   3. Samples — 6 thumbnails for promoted, dashed placeholder for staged
//   4. Participants — avatars + names
//   5. Action  — Open set / View in staging pill
//
// Loading state is rendered by the caller (the data isn't fetched here).

export type SetPreviewPanelProps = {
  title: string;
  isVideo: boolean;
  previewData: CareerHoverPreviewData;
  href: string;
  linkLabel: string;
  isStaged?: boolean;
  onBackToSummary?: () => void;
};

const MAX_PARTICIPANT_AVATARS = 5;

export function SetPreviewPanel({
  title,
  isVideo,
  previewData,
  href,
  linkLabel,
  isStaged,
  onBackToSummary,
}: SetPreviewPanelProps) {
  const visibleParticipants = previewData.participants.slice(0, MAX_PARTICIPANT_AVATARS);
  const overflow = Math.max(0, previewData.participants.length - MAX_PARTICIPANT_AVATARS);
  const hasParticipants = previewData.participants.length > 0;

  return (
    <div className="rounded-lg border border-white/10 bg-card/40 p-3">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        {onBackToSummary && (
          <button
            type="button"
            onClick={onBackToSummary}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            title="Back to career summary"
          >
            <ArrowLeft size={10} />
            Summary
          </button>
        )}
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {title}
        </h3>
      </div>

      {/* Cover — full panel width, aspect adapts to type */}
      <div
        className={cn(
          "relative mb-3 w-full overflow-hidden rounded-md bg-muted/40",
          isVideo ? "aspect-video" : "aspect-[3/4]",
        )}
      >
        {previewData.coverUrl ? (
          <Image
            src={previewData.coverUrl}
            alt=""
            fill
            className="object-cover"
            unoptimized
            sizes="360px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            {isVideo ? <Film size={32} /> : <Camera size={32} />}
          </div>
        )}
      </div>

      {/* Samples grid */}
      {isStaged && previewData.sampleThumbnails.length === 0 ? (
        <div className="mb-3 flex items-center justify-center rounded border border-dashed border-white/10 px-3 py-4 text-center text-[10px] italic text-muted-foreground/60">
          No sample images yet — staged
        </div>
      ) : previewData.sampleThumbnails.length > 0 ? (
        <div className="mb-3 grid grid-cols-3 gap-1">
          {previewData.sampleThumbnails.slice(0, 6).map((t) => (
            <div
              key={t.mediaItemId}
              className="relative aspect-square overflow-hidden rounded bg-muted/40"
            >
              <Image
                src={t.url}
                alt=""
                fill
                className="object-cover"
                unoptimized
                sizes="100px"
              />
            </div>
          ))}
        </div>
      ) : null}

      {/* Participants */}
      {hasParticipants && (
        <div className="mb-3 border-t border-white/10 pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Participants
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {visibleParticipants.map((p) => (
              <div
                key={p.personId}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-muted/60 text-[9px] font-medium text-muted-foreground"
                title={p.commonAlias ?? p.icgId}
              >
                {getInitialsFromName(p.commonAlias ?? p.icgId)}
              </div>
            ))}
            {overflow > 0 && (
              <span className="text-[10px] text-muted-foreground/70">+{overflow}</span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground/80">
            {visibleParticipants.map((p) => p.commonAlias ?? p.icgId).join(" · ")}
            {overflow > 0 && ` …`}
          </div>
        </div>
      )}

      {/* Action */}
      <div className="flex justify-end border-t border-white/10 pt-2">
        <Link
          href={href}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10",
            "px-3 py-1 text-[11px] font-medium text-primary",
            "transition-colors hover:bg-primary/20",
          )}
        >
          {linkLabel}
          <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  );
}

export function SetPreviewPanelLoading({
  title,
  onBackToSummary,
}: {
  title: string;
  onBackToSummary?: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-card/40 p-3">
      <div className="mb-3 flex items-center gap-2">
        {onBackToSummary && (
          <button
            type="button"
            onClick={onBackToSummary}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          >
            <ArrowLeft size={10} />
            Summary
          </button>
        )}
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {title}
        </h3>
      </div>
      <div className="aspect-[3/4] w-full animate-pulse rounded-md bg-muted/40" />
      <p className="mt-3 text-center text-[10px] italic text-muted-foreground/60">
        Loading preview…
      </p>
    </div>
  );
}
