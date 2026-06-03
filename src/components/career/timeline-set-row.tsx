"use client";

import Link from "next/link";
import Image from "next/image";
import { Camera, Film, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  StatusPill,
  STATUS_STRIPE_CLASS,
  STATUS_TINT_CLASS,
  type SetStatus,
} from "@/components/shared/status-pill";
import type { CareerTimelineRow } from "@/lib/services/career-service";

// One row in the Career timeline. Date-first / title-second anatomy per
// the grilling outcome (matches archive folder naming convention reading
// order). 80px medium density. Status differentiation via left border
// stripe + pill (+ optional row background tint when withTint=true).
// Click navigates: promoted → /sets/[id]; staged → /staging-sets focused
// on that staging-set id.

const STATUS_BY_KIND: Record<CareerTimelineRow["kind"], SetStatus> = {
  promoted: "promoted",
  staged: "staged",
};

function formatIsoDate(date: Date | null): string {
  if (!date) return "????-??-??";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function StarsCompact({ rating }: { rating: number | null }) {
  if (rating === null) return null;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`rated ${rating} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={10}
          className={cn(
            i < rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/25",
          )}
        />
      ))}
    </span>
  );
}

export type TimelineSetRowProps = {
  row: CareerTimelineRow;
  withTint: boolean;
  ageAtShoot?: string | null;
  onHoverEnter?: (row: CareerTimelineRow) => void;
  onHoverLeave?: () => void;
};

export function TimelineSetRow({
  row,
  withTint,
  ageAtShoot,
  onHoverEnter,
  onHoverLeave,
}: TimelineSetRowProps) {
  const status = STATUS_BY_KIND[row.kind];
  const isVideo = row.type === "video";
  const href =
    row.kind === "promoted"
      ? `/sets/${row.setId}`
      : `/staging-sets?focus=${row.stagingSetId}`;

  // Build the metadata Line 1 segments: date · channel · item-count · age
  const segments: string[] = [];
  segments.push(formatIsoDate(row.releaseDate));
  if (row.channelName) segments.push(row.channelName);
  if (row.itemCount !== null && row.itemCount > 0) {
    segments.push(`${row.itemCount} ${isVideo ? "frames" : "photos"}`);
  }
  if (ageAtShoot) segments.push(`age ${ageAtShoot}`);

  // Cover dimensions: portrait for photos, landscape for videos.
  const coverW = isVideo ? 80 : 60;
  const coverH = isVideo ? 45 : 80;

  return (
    <Link
      href={href}
      onMouseEnter={() => onHoverEnter?.(row)}
      onMouseLeave={() => onHoverLeave?.()}
      className={cn(
        "group flex items-center gap-3 rounded-md border border-l-4 border-white/10 px-3 py-2",
        "transition-all duration-150",
        "hover:-translate-y-px hover:shadow-[0_4px_14px_-6px_rgba(0,0,0,0.25)] hover:bg-white/[0.03]",
        STATUS_STRIPE_CLASS[status],
        withTint && STATUS_TINT_CLASS[status],
      )}
      style={{ minHeight: isVideo ? 60 : 90 }}
    >
      {/* Cover */}
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded bg-muted/40",
        )}
        style={{ width: coverW, height: coverH }}
      >
        {row.coverUrl ? (
          <Image
            src={row.coverUrl}
            alt=""
            fill
            className="object-cover"
            unoptimized
            sizes={`${coverW}px`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            {isVideo ? <Film size={20} /> : <Camera size={20} />}
          </div>
        )}
      </div>

      {/* Meta column */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Line 1: scan column — muted weight, date-first */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {isVideo ? (
            <Film size={11} className="shrink-0" />
          ) : (
            <Camera size={11} className="shrink-0" />
          )}
          <span className="truncate">
            {segments.map((s, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1.5 opacity-50">·</span>}
                {s}
              </span>
            ))}
          </span>
        </div>
        {/* Line 2: title (bold) + rating + status pill */}
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {row.title}
          </span>
          <StarsCompact rating={row.rating} />
          <StatusPill status={status} />
        </div>
      </div>
    </Link>
  );
}
