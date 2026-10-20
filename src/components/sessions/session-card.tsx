"use client";

import Image from "next/image";
import Link from "next/link";
import { Clapperboard, ImageIcon, Camera, Film, ShoppingBasket, Star } from "lucide-react";
import { cn, focalStyle, formatPartialDateISO, computeProductionAge } from "@/lib/utils";
import { useDensity } from "@/components/layout/density-provider";
import { useBrowserLayout } from "@/components/layout/browser-layout-provider";
import { SessionStatusBadge } from "./session-status-badge";
import { PivotDate, PivotPersonAvatar, PivotValue } from "@/components/shared/pivot";
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
  isStarred?: boolean;
  onToggleStar?: (id: string) => void;
  /** In the merge basket (2026-10-20) — the toggle sits bottom-left of the cover */
  inBasket?: boolean;
  onToggleBasket?: (id: string) => void;
};

function getContributorName(
  person: SessionItem["contributions"][number]["person"],
): string {
  const common = person.aliases.find((a) => a.isCommon);
  return common?.name ?? person.icgId;
}


// Top-level extraction (was defined inside SessionCard, which broke
// React Compiler optimisation: lint react-hooks/static-components).
function AvatarRow({
  avatarSize,
  avatarContributors,
  totalContributionCount,
  headshotMap,
  sessionId,
  sessionDate,
  sessionDatePrecision,
  sessionDateIsConfirmed,
}: {
  avatarSize: number;
  avatarContributors: SessionItem["contributions"];
  totalContributionCount: number;
  headshotMap: Record<string, HeadshotData>;
  sessionId: string;
  sessionDate: SessionItem["date"];
  sessionDatePrecision: SessionItem["datePrecision"];
  sessionDateIsConfirmed: SessionItem["dateIsConfirmed"];
}) {
  if (avatarContributors.length === 0) return null;
  return (
    <div className="mt-2 flex items-start gap-1">
        {avatarContributors.map((c) => (
          <PivotPersonAvatar
            key={`${sessionId}-${c.person.id}`}
            personId={c.person.id}
            icgId={c.person.icgId}
            name={getContributorName(c.person)}
            headshot={headshotMap[c.person.id]}
            size={avatarSize}
            age={computeProductionAge(
              c.person.birthdate,
              c.person.birthdatePrecision,
              sessionDate,
              sessionDatePrecision,
              sessionDateIsConfirmed,
            )}
          />
        ))}
        {totalContributionCount > 4 && (
          <div className="flex flex-col items-center gap-0.5" style={{ width: avatarSize + 8 }}>
            <div
              className="flex items-center justify-center rounded-full border border-white/20 bg-muted/60 text-[9px] text-muted-foreground"
              style={{ width: avatarSize, height: avatarSize }}
            >
              +{totalContributionCount - 4}
            </div>
          </div>
        )}
    </div>
  );
}


export function SessionCard({
  session,
  coverPhoto,
  headshotMap = {},
  isStarred = false,
  onToggleStar,
  inBasket = false,
  onToggleBasket,
}: SessionCardProps) {
  const { density } = useDensity();
  const { sessionsLayout, sessionsCoverAspect } = useBrowserLayout();
  const isCompact = density === "compact";
  const isPoster = sessionsLayout === "poster";
  const isPortrait = isPoster && sessionsCoverAspect === "portrait";

  const mediaCount = session._count.mediaItems;
  const photoSetCount = session.setSessionLinks.filter((l) => l.set.type === "photo").length;
  const videoSetCount = session.setSessionLinks.filter((l) => l.set.type === "video").length;
  const totalSetCount = session.setSessionLinks.length;
  const hasMixedSets = photoSetCount > 0 && videoSetCount > 0;

  const dateStr = formatPartialDateISO(session.date, session.datePrecision) || null;

  const avatarContributors = session.contributions.slice(0, 4);

  function handleStarClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onToggleStar?.(session.id);
  }

  function handleBasketClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onToggleBasket?.(session.id);
  }

  const basketButton = (className: string) =>
    onToggleBasket && (
      <button
        type="button"
        onClick={handleBasketClick}
        aria-pressed={inBasket}
        className={cn(
          "absolute size-5 flex items-center justify-center rounded-full transition-all duration-150",
          "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          inBasket ? "bg-primary text-primary-foreground opacity-100" : "bg-black/40 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-black/60",
          className,
        )}
        aria-label={inBasket ? `Merge basket: take out “${session.name}”` : `Merge basket: put in “${session.name}”`}
        title={inBasket ? "In the merge basket — click to take it out" : "Add to the merge basket"}
      >
        <ShoppingBasket size={10} aria-hidden="true" />
      </button>
    );

  const avatarRowProps = {
    avatarContributors,
    totalContributionCount: session.contributions.length,
    headshotMap,
    sessionId: session.id,
    sessionDate: session.date,
    sessionDatePrecision: session.datePrecision,
    sessionDateIsConfirmed: session.dateIsConfirmed,
  };

  // ── Poster layout ──────────────────────────────────────────────────────────
  if (isPoster) {
    return (
      <Link href={`/sessions/${session.id}`} prefetch={false} className="group block focus-visible:outline-none">
        <div
          className={cn(
            "relative overflow-hidden rounded-xl border border-white/15 bg-card/70 shadow-md backdrop-blur-sm",
            "transition-all duration-200",
            "hover:border-white/30 hover:bg-card/90 hover:shadow-lg hover:-translate-y-0.5",
            "active:scale-[0.98] active:shadow-sm active:translate-y-0",
            "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
          )}
        >
          {/* Cover — aspect depends on user preference */}
          <div className={cn("relative overflow-hidden bg-muted/30", isPortrait ? "aspect-[2/3]" : "aspect-[4/3]")}>
            {coverPhoto ? (
              <Image
                src={coverPhoto.url}
                alt={session.name}
                fill
                className="object-cover"
                style={focalStyle(coverPhoto.focalX, coverPhoto.focalY)}
                unoptimized
                sizes={isCompact ? "160px" : "220px"}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                <Clapperboard size={28} />
              </div>
            )}

            {/* Draft badge on cover corner */}
            {session.status === "DRAFT" && (
              <div className="absolute top-1 right-1">
                <SessionStatusBadge status="DRAFT" className="px-1 py-px text-[9px]" />
              </div>
            )}

            {basketButton("bottom-1.5 left-1.5")}
            {onToggleStar && (
              <button
                type="button"
                onClick={handleStarClick}
                className={cn(
                  "absolute bottom-1.5 right-1.5 size-5 flex items-center justify-center rounded-full bg-black/40 transition-all duration-150",
                  isStarred ? "opacity-100" : "opacity-0 group-hover:opacity-100 hover:bg-black/60",
                )}
                aria-label={isStarred ? "Unstar" : "Star"}
              >
                <Star
                  size={10}
                  className={isStarred ? "fill-amber-400 text-amber-400" : "text-white/70"}
                />
              </button>
            )}
          </div>

          {/* Text + avatars */}
          <div className="px-2.5 pt-2 pb-2.5">
            <h3 className="text-sm font-semibold line-clamp-2 leading-snug mb-0.5">{session.name}</h3>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
              {session.label && (
                <PivotValue value={session.label.id} name={session.label.name} className="truncate">
                  {session.label.name}
                </PivotValue>
              )}
              {session.label && dateStr && <span className="shrink-0 text-muted-foreground/30">·</span>}
              {dateStr && <PivotDate date={session.date} precision={session.datePrecision} className="shrink-0 tabular-nums" />}
              {mediaCount > 0 && (
                <>
                  <span className="ml-auto shrink-0 text-muted-foreground/30">·</span>
                  <span className="shrink-0 inline-flex items-center gap-0.5 tabular-nums">
                    <ImageIcon size={9} />
                    {mediaCount}
                  </span>
                </>
              )}
            </div>

            {/* Avatars — comfortable only */}
            {!isCompact && <AvatarRow {...avatarRowProps} avatarSize={24} />}
          </div>
        </div>
      </Link>
    );
  }

  // ── Refined strip layout ───────────────────────────────────────────────────
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

          {/* Draft badge on cover corner */}
          {session.status === "DRAFT" && (
            <div className="absolute top-1 right-1">
              <SessionStatusBadge status="DRAFT" className="px-1 py-px text-[9px]" />
            </div>
          )}

          {basketButton("bottom-1 left-1")}
          {onToggleStar && (
            <button
              type="button"
              onClick={handleStarClick}
              className={cn(
                "absolute bottom-1 right-1 size-5 flex items-center justify-center rounded-full bg-black/40 transition-all duration-150",
                isStarred ? "opacity-100" : "opacity-0 group-hover:opacity-100 hover:bg-black/60",
              )}
              aria-label={isStarred ? "Unstar" : "Star"}
            >
              <Star
                size={10}
                className={isStarred ? "fill-amber-400 text-amber-400" : "text-white/70"}
              />
            </button>
          )}
        </div>

        {/* Metadata */}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col justify-center overflow-hidden",
            isCompact ? "p-2" : "p-3",
          )}
        >
          {/* Line 1: date · label */}
          <div className={cn("flex items-center gap-1.5 text-muted-foreground/70", isCompact ? "text-[10px]" : "text-xs")}>
            {dateStr && <PivotDate date={session.date} precision={session.datePrecision} className="shrink-0 tabular-nums" />}
            {dateStr && session.label && <span className="text-muted-foreground/40">·</span>}
            {session.label && (
              <PivotValue value={session.label.id} name={session.label.name} className="truncate">
                {session.label.name}
              </PivotValue>
            )}
          </div>

          {/* Line 2: title — dominant */}
          <h3
            className={cn(
              "mt-0.5 line-clamp-1 font-semibold leading-snug",
              isCompact ? "text-sm" : "text-base",
            )}
          >
            {session.name}
          </h3>

          {/* Line 3: media count · set count */}
          <div className={cn("mt-0.5 flex items-center gap-1.5 text-muted-foreground/70", isCompact ? "text-[10px]" : "text-xs")}>
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

          {/* Avatar row — comfortable only */}
          {!isCompact && <AvatarRow {...avatarRowProps} avatarSize={24} />}
        </div>
      </div>
    </Link>
  );
}
