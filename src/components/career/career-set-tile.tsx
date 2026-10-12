"use client";

import Link from "next/link";
import Image from "next/image";
import { Camera, Film, FolderCheck, FolderX, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_DISPLAY_LABEL } from "@/components/shared/status-pill";
import type { CareerTimelineRow, CareerRowStatus } from "@/lib/services/career-service";

// One poster in the Career gallery — the visual counterpart of
// TimelineSetRow, for promoted and staged sets alike. Cover first; title and
// date below; status, archive state, rating and media type as badges on the
// image. Hovering a promoted photo set swaps in a strip of its sample images,
// so the gallery shows what is inside, not only the cover. Same click target
// as the row: promoted → /sets/[id]; staged → /staging-sets focused on it.
//
// The cover's frame marks what still needs work, and fades as a set is
// developed: in the archive only (a folder, not yet approved) = dashed amber,
// approved but not promoted = solid emerald, promoted = no frame — the
// finished sets are the calm background. Line style differs as well as hue,
// so amber and green tell apart without colour (WCAG 1.4.1). A set only in
// the pipeline (pending / in review, no archive folder — "All" scope) has no
// frame either, but a dimmed cover.

const STATUS_DOT_CLASS: Record<CareerRowStatus, string> = {
  promoted: "bg-emerald-500",
  approved: "bg-cyan-500",
  reviewing: "bg-amber-500",
  pending: "bg-blue-500",
};

export type CareerTier = "promoted" | "approved" | "archive" | "pipeline";

export function careerTier(row: CareerTimelineRow): CareerTier {
  if (row.rowStatus === "promoted") return "promoted";
  if (row.rowStatus === "approved") return "approved";
  return row.hasArchiveLink ? "archive" : "pipeline";
}

export const CAREER_TIER_FRAME_CLASS: Record<CareerTier, string> = {
  promoted: "",
  approved: "outline-2 outline-solid outline-emerald-500/80",
  archive: "outline-2 outline-dashed outline-amber-500/90",
  pipeline: "",
};

export const CAREER_TIER_LABEL: Record<CareerTier, string> = {
  promoted: "Promoted",
  approved: "Approved",
  archive: "In archive only",
  pipeline: "Pipeline only",
};

function formatIsoDate(date: Date | null): string {
  if (!date) return "Undated";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function archiveBadge(row: CareerTimelineRow): { ok: boolean; label: string } | null {
  if (!row.hasArchiveLink || row.archiveStatus === null) return null;
  if (row.archiveStatus === "OK") return { ok: true, label: "In archive" };
  if (row.archiveStatus === "PENDING" || row.archiveStatus === "UNKNOWN") return null;
  const label = { MISSING: "Missing", CHANGED: "Changed", INCOMPLETE: "Incomplete" }[row.archiveStatus];
  return { ok: false, label: `Archive: ${label}` };
}

export type CareerSetTileProps = {
  row: CareerTimelineRow;
};

export function CareerSetTile({ row }: CareerSetTileProps) {
  const isVideo = row.type === "video";
  const href = row.kind === "promoted" ? `/sets/${row.setId}` : `/staging-sets?focus=${row.stagingSetId}`;
  const archive = archiveBadge(row);
  const samples = row.sampleThumbnails;
  const rating = row.rating;
  const tier = careerTier(row);

  const tooltip = [
    row.title,
    CAREER_TIER_LABEL[tier],
    row.channelName,
    row.participants.length > 0
      ? `with ${row.participants.map((p) => p.commonAlias).join(", ")}${row.extraParticipantCount > 0 ? ` +${row.extraParticipantCount}` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={href}
      title={tooltip}
      className={cn(
        "group flex min-w-0 flex-col gap-1.5 rounded-lg p-1 outline-none transition-colors duration-150",
        "hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-primary/60",
      )}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-md bg-muted/40",
          CAREER_TIER_FRAME_CLASS[tier] ? cn("outline-offset-1", CAREER_TIER_FRAME_CLASS[tier]) : "border border-white/10",
          // Fixed to what the covers are — photo 2:3, video 16:9 — not the
          // per-browser Sets cover setting, so every gallery looks the same
          isVideo ? "aspect-video" : "aspect-[2/3]",
        )}
      >
        {row.coverUrl ? (
          <Image
            src={row.coverUrl}
            alt=""
            fill
            unoptimized
            loading="lazy"
            decoding="async"
            className={cn(
              "object-cover transition duration-200 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100",
              tier === "pipeline" && "opacity-60 group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            {isVideo ? <Film size={24} /> : <Camera size={24} />}
          </div>
        )}

        {/* What is inside — promoted photo sets only */}
        {samples.length > 0 && (
          <div className="absolute inset-x-0 bottom-0 grid grid-cols-4 gap-0.5 bg-black/60 p-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
            {samples.map((t) => (
              <div key={t.mediaItemId} className="relative aspect-square overflow-hidden rounded-sm">
                <Image src={t.url} alt="" fill unoptimized loading="lazy" className="object-cover" />
              </div>
            ))}
          </div>
        )}

        {/* Badges */}
        <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
          <span
            className="inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
            title={STATUS_DISPLAY_LABEL[row.rowStatus]}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_CLASS[row.rowStatus])} aria-hidden />
            <span className="sr-only">{STATUS_DISPLAY_LABEL[row.rowStatus]}</span>
            {isVideo && <Film size={10} aria-label="Video" />}
          </span>
        </div>
        {archive && (
          <span
            className={cn(
              "absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 backdrop-blur-sm",
              archive.ok ? "text-green-400" : "text-red-400",
            )}
            title={archive.label}
            aria-label={archive.label}
          >
            {archive.ok ? <FolderCheck size={11} /> : <FolderX size={11} />}
          </span>
        )}
        {rating !== null && rating > 0 && (
          <span
            className={cn(
              "absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 backdrop-blur-sm",
              samples.length > 0 && "transition-opacity group-hover:opacity-0",
            )}
            aria-label={`rated ${rating} of 5`}
          >
            <Star size={10} className="fill-amber-300" />
            {rating}
          </span>
        )}
      </div>

      <div className="min-w-0 px-0.5">
        <p className="truncate text-xs font-medium text-foreground">{row.title}</p>
        <p className="truncate font-mono text-[10px] tabular-nums text-muted-foreground">
          {formatIsoDate(row.releaseDate)}
          {row.viewerUsedName && <span className="ml-1 font-sans italic">as {row.viewerUsedName}</span>}
        </p>
      </div>
    </Link>
  );
}
