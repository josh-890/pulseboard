"use client";

import Image from "next/image";
import Link from "next/link";
import { Camera, Film, AlertTriangle } from "lucide-react";
import { cn, focalStyle, formatPartialDateISO, getInitialsFromName, computeProductionAge } from "@/lib/utils";
import { useDensity } from "@/components/layout/density-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { getSets } from "@/lib/services/set-service";
import type { SuggestedFolderInfo } from "@/lib/services/archive-service";

type SetItem = Awaited<ReturnType<typeof getSets>>[number];

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

type SetCardProps = {
  set: SetItem;
  coverPhoto?: CoverPhotoData;
  headshotMap?: Record<string, HeadshotData>;
  unresolvedCreditCount?: number;
  suggestedArchiveFolder?: SuggestedFolderInfo | null;
};

function getPersonName(
  person: SetItem["participants"][number]["person"],
): string {
  const common = person.aliases.find((a) => a.isCommon);
  return common?.name ?? person.icgId;
}


const HOVER_SIZE = 64;

function ParticipantAvatar({
  name,
  headshot,
  size,
  age,
}: {
  name: string;
  headshot?: HeadshotData;
  size: number;
  age?: string;
}) {
  const initials = getInitialsFromName(name);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex cursor-default flex-col items-center gap-0.5"
          style={{ width: size + 8 }}
        >
          {/* Small avatar */}
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

          {/* First-name label */}
          <span
            className="w-full truncate text-center text-[8px] leading-tight text-muted-foreground"
            title={name}
          >
            {name.split(" ")[0]}
          </span>
          {age && (
            <span className="text-[8px] leading-none text-muted-foreground/60">
              {age}
            </span>
          )}
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
        {age && <span className="text-xs text-muted-foreground">{age}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export function SetCard({ set, coverPhoto, headshotMap = {}, unresolvedCreditCount = 0, suggestedArchiveFolder }: SetCardProps) {
  const { density } = useDensity();
  const isCompact = density === "compact";
  const isPhoto = set.type === "photo";

  const dateStr = formatPartialDateISO(set.releaseDate, set.releaseDatePrecision);
  const channelDisplay = set.channel?.name ?? "";
  const mediaCount = set._count.setMediaItems;

  // Unique resolved artists from credits
  const artistNames = [
    ...new Map(
      set.creditsRaw
        .filter((c) => c.resolvedArtist != null)
        .map((c) => [c.resolvedArtistId, c.resolvedArtist!.name]),
    ).values(),
  ];
  const artistLine = artistNames.slice(0, 2).join(" · ");
  const extraArtists = artistNames.length > 2 ? artistNames.length - 2 : 0;

  // Up to 4 participants for the avatar row
  const avatarParticipants = set.participants.slice(0, 4);

  // Primary session for production age
  const primarySession = set.sessionLinks[0]?.session ?? null;

  return (
    <Link href={`/sets/${set.id}`} prefetch={false} className="group block focus-visible:outline-none">
      <div
        className={cn(
          "relative flex overflow-hidden rounded-2xl border border-white/20 border-l-4 border-l-entity-set/40 bg-card/70 shadow-md backdrop-blur-sm",
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
              alt={set.title}
              fill
              className="object-cover"
              style={focalStyle(coverPhoto.focalX, coverPhoto.focalY)}
              unoptimized
              sizes={isCompact ? "100px" : "160px"}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
              {isPhoto ? <Camera size={isCompact ? 20 : 28} /> : <Film size={isCompact ? 20 : 28} />}
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
          {/* Line 1: date · channel · type icon (right) */}
          <div className={cn("flex items-center gap-1.5 text-muted-foreground", isCompact ? "text-[10px]" : "text-xs")}>
            {dateStr && <span className="shrink-0 tabular-nums">{dateStr}</span>}
            {dateStr && channelDisplay && <span className="text-muted-foreground/40">·</span>}
            {channelDisplay && <span className="truncate">{channelDisplay}</span>}
            <span className="ml-auto shrink-0 text-muted-foreground/30">
              {isPhoto ? <Camera size={11} /> : <Film size={11} />}
            </span>
          </div>

          {/* Line 2: title */}
          <h3
            className={cn(
              "mt-0.5 line-clamp-1 font-semibold leading-snug",
              isCompact ? "text-sm" : "text-base",
            )}
          >
            {set.title}
          </h3>

          {/* Line 3: artist names · media count */}
          <div className={cn("mt-0.5 flex items-center gap-1.5 text-muted-foreground", isCompact ? "text-[10px]" : "text-xs")}>
            {artistLine && (
              <span className="truncate">
                {artistLine}
                {extraArtists > 0 && <span className="text-muted-foreground/60"> +{extraArtists}</span>}
              </span>
            )}
            {artistLine && mediaCount > 0 && <span className="shrink-0 text-muted-foreground/40">·</span>}
            {mediaCount > 0 && (
              <span className="shrink-0 inline-flex items-center gap-0.5 tabular-nums">
                {isPhoto ? <Camera size={9} className="text-muted-foreground/50" /> : <Film size={9} className="text-muted-foreground/50" />}
                {mediaCount}
              </span>
            )}
            {unresolvedCreditCount > 0 && (
              <span className="ml-auto shrink-0 inline-flex items-center gap-0.5 text-amber-500">
                <AlertTriangle size={9} />
                {unresolvedCreditCount}
              </span>
            )}
          </div>

          {/* Avatar row — comfortable mode only */}
          {!isCompact && avatarParticipants.length > 0 && (
            <TooltipProvider delayDuration={200}>
              <div className="mt-2 flex items-start gap-1">
                {avatarParticipants.map((p) => (
                  <ParticipantAvatar
                    key={`${p.setId}-${p.personId}`}
                    name={getPersonName(p.person)}
                    headshot={headshotMap[p.personId]}
                    size={28}
                    age={computeProductionAge(
                      p.person.birthdate,
                      p.person.birthdatePrecision,
                      primarySession?.date ?? null,
                      primarySession?.datePrecision ?? "UNKNOWN",
                      primarySession?.dateIsConfirmed ?? false,
                      set.releaseDate,
                      set.releaseDatePrecision,
                    )}
                  />
                ))}
                {set.participants.length > 4 && (
                  <div className="flex flex-col items-center gap-0.5" style={{ width: 36 }}>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-muted/60 text-[9px] text-muted-foreground">
                      +{set.participants.length - 4}
                    </div>
                  </div>
                )}
              </div>
            </TooltipProvider>
          )}
        </div>

        {/* Archive link status — corner triangle, top-right.
            Show when no CONFIRMED archive link is present. */}
        {!set.archiveLinks?.length && (
          <div
            title={suggestedArchiveFolder ? 'Archive folder suggestion available' : 'No archive folder linked'}
            className={cn(
              'absolute top-0 right-0 w-0 h-0 z-10',
              'border-t-[20px] border-l-[20px] border-l-transparent',
              suggestedArchiveFolder ? 'border-t-amber-500' : 'border-t-red-500/80',
            )}
          />
        )}
      </div>
    </Link>
  );
}
