"use client";

import Image from "next/image";
import Link from "next/link";
import { Clapperboard, ImageIcon, Camera, Film } from "lucide-react";
import { cn, focalStyle, formatPartialDateISO, getInitialsFromName } from "@/lib/utils";
import { useDensity } from "@/components/layout/density-provider";
import { SessionStatusBadge } from "./session-status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { getSessions } from "@/lib/services/session-service";

type SessionItem = Awaited<ReturnType<typeof getSessions>>[number];

type CoverPhotoData = {
  url: string;
  focalX: number | null;
  focalY: number | null;
};

type HeadshotData = {
  url: string;
  focalX: number | null;
  focalY: number | null;
};

type SessionCardProps = {
  session: SessionItem;
  coverPhoto?: CoverPhotoData;
  headshotMap?: Record<string, HeadshotData>;
};

function getContributorName(
  person: SessionItem["contributions"][number]["person"],
): string {
  const common = person.aliases.find((a) => a.isCommon);
  return common?.name ?? person.icgId;
}

const HOVER_SIZE = 64;

function ContributorAvatar({
  name,
  headshot,
  size,
}: {
  name: string;
  headshot?: HeadshotData;
  size: number;
}) {
  const initials = getInitialsFromName(name);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex cursor-default flex-col items-center gap-0.5"
          style={{ width: size + 8 }}
        >
          <div
            className="relative shrink-0 overflow-hidden rounded-full border border-white/20 bg-muted/60"
            style={{ width: size, height: size }}
          >
            {headshot ? (
              <Image
                src={headshot.url}
                alt={name}
                fill
                className="object-cover"
                style={focalStyle(headshot.focalX, headshot.focalY)}
                unoptimized
                sizes={`${size}px`}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[9px] font-medium text-muted-foreground">
                {initials}
              </span>
            )}
          </div>
          <span
            className="w-full truncate text-center text-[8px] leading-tight text-muted-foreground"
            title={name}
          >
            {name.split(" ")[0]}
          </span>
        </div>
      </TooltipTrigger>

      <TooltipContent
        side="top"
        sideOffset={6}
        className="flex flex-col items-center gap-2 rounded-xl border border-white/15 bg-card/90 p-2.5 shadow-xl backdrop-blur-md [&>svg]:fill-primary/35"
      >
        <div
          className="relative overflow-hidden rounded-full border-2 border-white/20"
          style={{ width: HOVER_SIZE, height: HOVER_SIZE }}
        >
          {headshot ? (
            <Image
              src={headshot.url}
              alt={name}
              fill
              className="object-cover"
              style={focalStyle(headshot.focalX, headshot.focalY)}
              unoptimized
              sizes={`${HOVER_SIZE}px`}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xl font-medium text-muted-foreground">
              {initials}
            </span>
          )}
        </div>
        <span className="text-xs font-medium text-popover-foreground">{name}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function SessionCard({ session, coverPhoto, headshotMap = {} }: SessionCardProps) {
  const { density } = useDensity();
  const isCompact = density === "compact";

  const mediaCount = session._count.mediaItems;
  const photoSetCount = session.setSessionLinks.filter((l) => l.set.type === "photo").length;
  const videoSetCount = session.setSessionLinks.filter((l) => l.set.type === "video").length;
  const totalSetCount = session.setSessionLinks.length;
  const hasMixedSets = photoSetCount > 0 && videoSetCount > 0;

  const dateStr = formatPartialDateISO(session.date, session.datePrecision) || null;

  const avatarContributors = session.contributions.slice(0, 4);

  return (
    <Link href={`/sessions/${session.id}`} prefetch={false} className="group block focus-visible:outline-none">
      <div
        className={cn(
          "flex overflow-hidden rounded-2xl border border-white/20 border-l-4 border-l-entity-session/40 bg-card/70 shadow-md backdrop-blur-sm",
          "transition-all duration-200",
          "hover:border-white/30 hover:bg-card/90 hover:shadow-lg hover:-translate-y-0.5",
          "active:scale-[0.98] active:shadow-sm active:translate-y-0",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
          "flex-col sm:flex-row",
          isCompact ? "sm:h-[100px]" : "sm:h-auto",
        )}
      >
        {/* Thumbnail */}
        <div
          className={cn(
            "relative shrink-0 overflow-hidden bg-muted/30",
            "h-[120px] w-full sm:h-full",
            isCompact ? "sm:w-[100px] sm:h-[100px]" : "sm:w-[160px] sm:h-[160px]",
          )}
        >
          {coverPhoto ? (
            <Image
              src={coverPhoto.url}
              alt={session.name}
              fill
              className="object-cover"
              style={focalStyle(coverPhoto.focalX, coverPhoto.focalY)}
              unoptimized
              sizes={isCompact ? "100px" : "160px"}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
              <Clapperboard size={isCompact ? 20 : 28} />
            </div>
          )}
        </div>

        {/* Metadata */}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col justify-center overflow-hidden",
            isCompact ? "p-2" : "p-3",
          )}
        >
          {/* Line 1: date · label + DRAFT badge (right) */}
          <div className={cn("flex items-center gap-1.5 text-muted-foreground", isCompact ? "text-[10px]" : "text-xs")}>
            {dateStr && <span className="shrink-0 tabular-nums">{dateStr}</span>}
            {dateStr && session.label && <span className="text-muted-foreground/40">·</span>}
            {session.label && <span className="truncate">{session.label.name}</span>}
            {session.status === "DRAFT" && (
              <span className="ml-auto shrink-0">
                <SessionStatusBadge status="DRAFT" className="px-1.5 py-0 text-[10px]" />
              </span>
            )}
          </div>

          {/* Line 2: title */}
          <h3
            className={cn(
              "mt-0.5 line-clamp-1 font-semibold leading-snug",
              isCompact ? "text-sm" : "text-base",
            )}
          >
            {session.name}
          </h3>

          {/* Line 3: media count · set count (with photo/video split) */}
          <div className={cn("mt-0.5 flex items-center gap-1.5 text-muted-foreground", isCompact ? "text-[10px]" : "text-xs")}>
            {mediaCount > 0 && (
              <span className="shrink-0 inline-flex items-center gap-0.5 tabular-nums">
                <ImageIcon size={9} className="text-muted-foreground/50" />
                {mediaCount}
              </span>
            )}
            {mediaCount > 0 && totalSetCount > 0 && (
              <span className="shrink-0 text-muted-foreground/40">·</span>
            )}
            {totalSetCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="tabular-nums">{totalSetCount} {totalSetCount === 1 ? "set" : "sets"}</span>
                {hasMixedSets && (
                  <span className="inline-flex items-center gap-0.5 text-muted-foreground/60">
                    <span>(</span>
                    <Camera size={8} />
                    <span className="tabular-nums">{photoSetCount}</span>
                    <Film size={8} className="ml-0.5" />
                    <span className="tabular-nums">{videoSetCount}</span>
                    <span>)</span>
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Avatar row — comfortable mode only */}
          {!isCompact && avatarContributors.length > 0 && (
            <TooltipProvider delayDuration={200}>
              <div className="mt-2 flex items-start gap-1">
                {avatarContributors.map((c) => (
                  <ContributorAvatar
                    key={`${session.id}-${c.person.id}`}
                    name={getContributorName(c.person)}
                    headshot={headshotMap[c.person.id]}
                    size={28}
                  />
                ))}
                {session.contributions.length > 4 && (
                  <div className="flex flex-col items-center gap-0.5" style={{ width: 36 }}>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-muted/60 text-[9px] text-muted-foreground">
                      +{session.contributions.length - 4}
                    </div>
                  </div>
                )}
              </div>
            </TooltipProvider>
          )}
        </div>
      </div>
    </Link>
  );
}
