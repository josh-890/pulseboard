"use client";

import Image from "next/image";
import Link from "next/link";
import { Camera, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDensity } from "@/components/layout/density-provider";
import type { getSets } from "@/lib/services/set-service";

type SetItem = Awaited<ReturnType<typeof getSets>>[number];

type SetCardProps = {
  set: SetItem;
  photoUrl?: string;
};

function formatReleaseDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getCastName(
  person: SetItem["contributions"][number]["person"],
): string {
  const common = person.aliases.find((a) => a.type === "common");
  return common?.name ?? person.icgId;
}

export function SetCard({ set, photoUrl }: SetCardProps) {
  const { density } = useDensity();
  const isCompact = density === "compact";
  const isPhoto = set.type === "photo";
  const visibleCast = set.contributions.slice(0, 3);

  return (
    <Link href={`/sets/${set.id}`} prefetch={false} className="group block focus-visible:outline-none">
      <div
        className={cn(
          "flex overflow-hidden rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm",
          "transition-all duration-200",
          "hover:border-white/30 hover:bg-card/90 hover:shadow-lg hover:-translate-y-0.5",
          "active:scale-[0.98] active:shadow-sm active:translate-y-0",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
          "flex-col sm:flex-row",
          isCompact ? "sm:h-[100px]" : "sm:h-[140px]",
        )}
      >
        {/* Thumbnail */}
        <div
          className={cn(
            "relative shrink-0 overflow-hidden bg-muted/30",
            "h-[120px] w-full sm:h-full",
            isCompact ? "sm:w-[72px]" : "sm:w-[100px]",
          )}
        >
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={set.title}
              fill
              className="object-cover object-center"
              unoptimized
              sizes={isCompact ? "72px" : "100px"}
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
          {/* Title + Type badge */}
          <div className="flex items-start justify-between gap-2">
            <h3
              className={cn(
                "line-clamp-1 font-semibold leading-tight",
                isCompact ? "text-sm" : "text-base",
              )}
            >
              {set.title}
            </h3>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium",
                isCompact ? "text-[10px]" : "text-xs",
                isPhoto
                  ? "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400"
                  : "border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400",
              )}
            >
              {isPhoto ? <Camera size={10} /> : <Film size={10} />}
              {isPhoto ? "Photo" : "Video"}
            </span>
          </div>

          {/* Channel / label + date */}
          <div
            className={cn(
              "mt-1 flex flex-wrap items-center gap-x-2 text-muted-foreground",
              isCompact ? "text-xs" : "text-sm",
            )}
          >
            {set.channel && (
              <span className="truncate">
                <span className="font-medium text-foreground/80">{set.channel.name}</span>
                {" · "}
                {set.channel.label.name}
              </span>
            )}
            {set.releaseDate && !isCompact && (
              <span className="shrink-0 text-xs">{formatReleaseDate(set.releaseDate)}</span>
            )}
          </div>

          {/* Cast — comfortable only */}
          {!isCompact && visibleCast.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {visibleCast.map((contribution) => (
                <span
                  key={contribution.id}
                  className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {getCastName(contribution.person)}
                </span>
              ))}
              {set.contributions.length > 3 && (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  +{set.contributions.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
