"use client";

import Link from "next/link";
import Image from "next/image";
import { Camera, Film, FolderCheck, FolderX, Star, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  StatusPill,
  STATUS_STRIPE_CLASS,
  STATUS_TINT_CLASS,
} from "@/components/shared/status-pill";
import type { CareerTimelineRow } from "@/lib/services/career-service";
import type { ArchiveStatus } from "@/generated/prisma/client";

// One row in the Career timeline. Date-first / title-second anatomy per
// the grilling outcome (matches archive folder naming convention reading
// order). 80px medium density. Status differentiation via left border
// stripe + pill (+ optional row background tint when withTint=true).
// Click navigates: promoted → /sets/[id]; staged → /staging-sets focused
// on that staging-set id.

function formatIsoDate(date: Date | null): string {
  if (!date) return "????-??-??";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Archive-link indicator pill — mirrors the hero pill style for visual
// consistency. Three visual states by intent (silent fourth for unlinked):
//   OK                        → green   "In archive"     (link confirmed + folder healthy)
//   MISSING/CHANGED/INCOMPLETE → red    specific label   (real operational problem)
//   PENDING/UNKNOWN           → slate   "Linked"         (linked but not yet validated — neither healthy nor a problem)
//   unlinked / null           → silent                   (absence of signal carries meaning)
//
// Why PENDING/UNKNOWN gets a neutral slate rather than red: red is reserved
// for states that demand action (folder gone, content drifted, files
// missing). Marking every freshly-linked-but-unverified row red would cry
// wolf and dilute the real-problem signal.
//
// Color choice: green for OK matches the hero. Problem state uses red
// (not amber) to avoid color collision with STAGED (amber) — the row's
// status pill carries amber/emerald and adding amber/green-only for
// archive would blur the two semantic axes.
function ArchivePill({
  archiveStatus,
  hasArchiveLink,
}: {
  archiveStatus: ArchiveStatus | null;
  hasArchiveLink: boolean;
}) {
  if (!hasArchiveLink || archiveStatus === null) return null;

  if (archiveStatus === "OK") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400"
        title="Archive folder linked and healthy"
      >
        <FolderCheck size={10} />
        In archive
      </span>
    );
  }

  if (archiveStatus === "PENDING" || archiveStatus === "UNKNOWN") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400"
        title={
          archiveStatus === "PENDING"
            ? "Archive folder linked — validation pending"
            : "Archive folder linked — state unknown"
        }
      >
        <FolderCheck size={10} />
        Linked
      </span>
    );
  }

  // MISSING / CHANGED / INCOMPLETE → red problem pill with specific issue.
  const label: Record<"MISSING" | "CHANGED" | "INCOMPLETE", string> = {
    MISSING: "Missing",
    CHANGED: "Changed",
    INCOMPLETE: "Incomplete",
  };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400"
      title={`Archive folder: ${label[archiveStatus]}`}
    >
      <FolderX size={10} />
      {label[archiveStatus]}
    </span>
  );
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
  // "full" (default) renders the cover + sample-thumbnail card; "compact"
  // renders a single-line row (no cover / thumbnails) — date · channel ·
  // title + status. Density is chosen at the timeline level.
  variant?: "full" | "compact";
  // Cover-hover events. The row attaches these to the cover thumbnail
  // ONLY (not the whole row), so the popover preview only triggers when
  // the user explicitly indicates intent ("I want to see this image
  // bigger") rather than firing on incidental row hover.
  onCoverEnter?: (coverRect: DOMRect) => void;
  onCoverLeave?: () => void;
};

export function TimelineSetRow({
  row,
  withTint,
  ageAtShoot,
  variant = "full",
  onCoverEnter,
  onCoverLeave,
}: TimelineSetRowProps) {
  const status = row.rowStatus;
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

  // Compact single-line variant: date · channel · title + status/archive/
  // rating, no cover or sample thumbnails. The whole line stays a
  // navigation link (clicking opens the set); the expand affordance lives
  // on the wrapping container in the timeline.
  if (variant === "compact") {
    return (
      <Link
        href={href}
        className={cn(
          "group flex min-h-0 items-center gap-2 rounded border border-l-4 border-white/10 px-2 py-1",
          "text-xs transition-colors hover:bg-white/[0.03]",
          STATUS_STRIPE_CLASS[status],
          withTint && STATUS_TINT_CLASS[status],
        )}
      >
        {isVideo ? (
          <Film size={11} className="shrink-0 text-muted-foreground" />
        ) : (
          <Camera size={11} className="shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
          {formatIsoDate(row.releaseDate)}
        </span>
        {row.channelName && (
          <>
            <span className="opacity-40">·</span>
            <span className="shrink-0 max-w-[10rem] truncate text-muted-foreground">
              {row.channelName}
            </span>
          </>
        )}
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {row.title}
          {row.viewerUsedName && (
            <span className="ml-1.5 italic text-muted-foreground/70">
              as {row.viewerUsedName}
            </span>
          )}
        </span>
        <StatusPill status={status} />
        <ArchivePill archiveStatus={row.archiveStatus} hasArchiveLink={row.hasArchiveLink} />
        <StarsCompact rating={row.rating} />
      </Link>
    );
  }

  // Cover dimensions: portrait for photos, landscape for videos.
  const coverW = isVideo ? 80 : 60;
  const coverH = isVideo ? 45 : 80;

  // Participants line: hidden for solo sets (only the viewer was in the
  // set, so participants[] is empty). When other collaborators are
  // present, we render a 3rd row line listing their common aliases with
  // a `+N` overflow chip.
  const hasParticipantLine = row.participants.length > 0;

  // Sample thumbnail strip: populated server-side for promoted photo
  // sets only (videos and staged sets have an empty array). Hidden on
  // narrow viewports — the cluster on the left is the priority there.
  const hasSampleStrip = row.sampleThumbnails.length > 0;

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-md border border-l-4 border-white/10 px-3 py-2",
        "transition-all duration-150",
        "hover:-translate-y-px hover:shadow-[0_4px_14px_-6px_rgba(0,0,0,0.25)] hover:bg-white/[0.03]",
        STATUS_STRIPE_CLASS[status],
        withTint && STATUS_TINT_CLASS[status],
      )}
      // Row height:
      //   - Photo: 90px always (the 60×80 portrait cover requires it).
      //   - Video, solo set:    60px (compact, 2-line content fits).
      //   - Video, multi-cast:  90px (3rd line for participants).
      style={{ minHeight: !isVideo ? 90 : hasParticipantLine ? 90 : 60 }}
    >
      {/* Cover — its OWN hover surface for the enlarged-cover popover.
          The popover is purely visual (no link pill, no extra info);
          clicking anywhere on the row navigates instead. */}
      <div
        className="relative shrink-0 overflow-hidden rounded bg-muted/40"
        style={{ width: coverW, height: coverH }}
        onMouseEnter={(e) => onCoverEnter?.(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => onCoverLeave?.()}
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
        {/* Line 2: title (bold) + status pill + rating, clustered on the
            left next to the cover. No flex-1 on the title — we don't want
            to push the pill/stars to the far right of the row (the
            "1012px void" that Phase 1 of the row-layout refinement fixed). */}
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {row.title}
          </span>
          {row.viewerUsedName && (
            <span
              className="shrink-0 text-xs italic text-muted-foreground/70"
              title="The name this person was credited under in this set"
            >
              as {row.viewerUsedName}
            </span>
          )}
          <StatusPill status={status} />
          <ArchivePill
            archiveStatus={row.archiveStatus}
            hasArchiveLink={row.hasArchiveLink}
          />
          <StarsCompact rating={row.rating} />
        </div>
        {/* Line 3: co-participants (hidden for solo sets). The viewer is
            never listed here — the surrounding page already names them. */}
        {hasParticipantLine && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Users size={11} className="shrink-0 opacity-60" />
            <span className="min-w-0 truncate">
              {row.participants.map((p, i) => (
                <span key={p.personId}>
                  {i > 0 && <span className="mx-1 opacity-50">·</span>}
                  {p.commonAlias}
                </span>
              ))}
              {row.extraParticipantCount > 0 && (
                <span className="ml-1.5 opacity-60">+{row.extraParticipantCount}</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Sample thumbnail strip — promoted photo sets only. Inspired by
          the Production Photos pattern in the Photos tab: each tile is
          h-16, width by aspect ratio. Hidden below `lg` so narrow
          viewports keep the cluster legible. */}
      {hasSampleStrip && (
        <div className="ml-auto hidden shrink-0 gap-1 lg:flex">
          {row.sampleThumbnails.map((thumb) => {
            const w =
              thumb.height > 0
                ? Math.round((thumb.width / thumb.height) * 64)
                : 64;
            return (
              <div
                key={thumb.mediaItemId}
                className="h-16 overflow-hidden rounded border border-white/10 bg-muted/40"
                style={{ width: w || 64 }}
              >
                <Image
                  src={thumb.url}
                  alt=""
                  width={w || 64}
                  height={64}
                  className="h-full w-full object-cover"
                  unoptimized
                  loading="lazy"
                />
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}
