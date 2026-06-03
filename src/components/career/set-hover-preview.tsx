"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Camera, Film } from "lucide-react";
import { cn, getInitialsFromName } from "@/lib/utils";
import type { CareerHoverPreviewData } from "@/lib/services/career-service";

// Floating preview card shown on row hover. Pure presentational — parent
// fetches the data and decides when to mount this. Layout:
//   ┌────────────────────────────────────────────┐
//   │ [enlarged cover]  [sample 1][sample 2]     │
//   │                   [sample 3][sample 4]     │
//   │                   [sample 5][sample 6]     │
//   │ ──────────────────────────────────────     │
//   │ (•) (•) (•) (•) +2  participants           │
//   │ ──────────────────────────────────────     │
//   │ [Open set →]                               │
//   └────────────────────────────────────────────┘

export type SetHoverPreviewProps = {
  title: string;
  isVideo: boolean;
  previewData: CareerHoverPreviewData;
  href: string;
  linkLabel: string;
  isStaged?: boolean;
};

const MAX_PARTICIPANT_AVATARS = 5;

export function SetHoverPreview({
  title,
  isVideo,
  previewData,
  href,
  linkLabel,
  isStaged,
}: SetHoverPreviewProps) {
  const coverW = isVideo ? 240 : 160;
  const coverH = isVideo ? 135 : 213;
  const visibleParticipants = previewData.participants.slice(0, MAX_PARTICIPANT_AVATARS);
  const overflow = Math.max(0, previewData.participants.length - MAX_PARTICIPANT_AVATARS);
  const hasParticipants = previewData.participants.length > 0;

  return (
    <div className="w-[420px] rounded-lg border border-white/15 bg-popover/95 p-3 shadow-xl backdrop-blur-sm">
      <div className="text-xs font-semibold text-foreground/90 mb-2 truncate">
        {title}
      </div>
      <div className="flex gap-3">
        {/* Cover */}
        <div
          className="relative shrink-0 overflow-hidden rounded bg-muted/40"
          style={{ width: coverW, height: coverH }}
        >
          {previewData.coverUrl ? (
            <Image
              src={previewData.coverUrl}
              alt=""
              fill
              className="object-cover"
              unoptimized
              sizes={`${coverW}px`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
              {isVideo ? <Film size={28} /> : <Camera size={28} />}
            </div>
          )}
        </div>
        {/* Samples grid */}
        <div className="flex min-w-0 flex-1 items-start">
          {isStaged && previewData.sampleThumbnails.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-white/10 px-3 py-4 text-center text-[10px] italic text-muted-foreground/60">
              No sample images yet — staged
            </div>
          ) : previewData.sampleThumbnails.length > 0 ? (
            <div className="grid grid-cols-3 gap-1">
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
                    sizes="64px"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-white/10 px-3 py-4 text-center text-[10px] italic text-muted-foreground/60">
              No sample images
            </div>
          )}
        </div>
      </div>

      {/* Participants line */}
      {hasParticipants && (
        <div className="mt-3 border-t border-white/10 pt-2">
          <div className="flex items-center gap-1.5">
            {visibleParticipants.map((p) => (
              <div
                key={p.personId}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 bg-muted/60 text-[9px] font-medium text-muted-foreground"
                title={p.commonAlias ?? p.icgId}
              >
                {getInitialsFromName(p.commonAlias ?? p.icgId)}
              </div>
            ))}
            {overflow > 0 && (
              <span className="text-[10px] text-muted-foreground/70">+{overflow}</span>
            )}
            <span className="ml-2 truncate text-[10px] text-muted-foreground/80">
              {visibleParticipants.map((p) => p.commonAlias ?? p.icgId).join(" · ")}
              {overflow > 0 && ` …`}
            </span>
          </div>
        </div>
      )}

      {/* Action pill */}
      <div className="mt-3 flex justify-end border-t border-white/10 pt-2">
        <Link
          href={href}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10",
            "px-2.5 py-1 text-[11px] font-medium text-primary",
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
