"use client";

import Image from "next/image";
import Link from "next/link";
import { MapPin, Sparkles } from "lucide-react";
import { FlagImage } from "@/components/shared/flag-image";
import { cn, getInitialsFromName, computeAge } from "@/lib/utils";
import { useDensity } from "@/components/layout/density-provider";
import type { PersonWithCommonAlias, PersonStatus } from "@/lib/types";

type PersonCardProps = {
  person: PersonWithCommonAlias;
  photoUrl?: string;
  focalX?: number | null;
  focalY?: number | null;
  plausibilityCount?: number;
  onClick?: () => void;
};

const STATUS_STYLES: Record<PersonStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  inactive: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
  wishlist: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  archived: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

const STATUS_LABELS: Record<PersonStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  wishlist: "Wishlist",
  archived: "Archived",
};

export function PersonCard({ person, photoUrl, focalX, focalY, plausibilityCount = 0, onClick }: PersonCardProps) {
  const { density } = useDensity();
  const isCompact = density === "compact";

  const displayName = person.commonAlias
    ? `${person.commonAlias} (${person.icgId})`
    : person.icgId;
  const initials = person.commonAlias
    ? getInitialsFromName(person.commonAlias)
    : person.icgId.charAt(0).toUpperCase();

  const age = person.birthdate ? computeAge(new Date(person.birthdate)) : null;

  // Show birth alias only if it differs from common alias
  const showBirthAlias =
    person.birthAlias && person.birthAlias !== person.commonAlias;

  return (
    <Link href={`/people/${person.id}`} prefetch={false} className="group block focus-visible:outline-none" onClick={onClick}>
      <div
        className={cn(
          "relative flex overflow-hidden rounded-2xl border border-white/20 border-l-4 border-l-entity-person/40 bg-card/70 shadow-md backdrop-blur-sm",
          "transition-all duration-200",
          "hover:border-white/30 hover:bg-card/90 hover:shadow-lg hover:-translate-y-0.5",
          "active:scale-[0.98] active:shadow-sm active:translate-y-0",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
          "flex-col sm:flex-row",
          isCompact ? "sm:h-[100px]" : "sm:h-[160px]",
        )}
      >
        {/* Photo / Initials */}
        <div
          className={cn(
            "relative shrink-0 overflow-hidden bg-primary/10",
            "h-[120px] w-full sm:h-full",
            isCompact ? "sm:w-[100px]" : "sm:w-[160px]",
          )}
        >
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={displayName}
              fill
              className="object-cover"
              style={{
                objectPosition:
                  focalX != null && focalY != null
                    ? `${(focalX * 100).toFixed(1)}% ${(focalY * 100).toFixed(1)}%`
                    : "center",
              }}
              unoptimized
              sizes={isCompact ? "100px" : "160px"}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span
                className={cn(
                  "font-bold text-primary",
                  isCompact ? "text-lg" : "text-2xl",
                )}
              >
                {initials}
              </span>
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
          {/* Name + Status */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p
                className={cn(
                  "truncate font-semibold leading-tight",
                  isCompact ? "text-sm" : "text-base",
                )}
              >
                {person.commonAlias ?? person.icgId}
              </p>
              {person.commonAlias && (
                <p className={cn(
                  "truncate font-mono text-muted-foreground",
                  isCompact ? "text-[10px]" : "text-xs",
                )}>
                  {person.icgId}
                </p>
              )}
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 font-medium",
                isCompact ? "text-[10px]" : "text-xs",
                STATUS_STYLES[person.status],
              )}
            >
              {STATUS_LABELS[person.status]}
            </span>
            {plausibilityCount > 0 && (
              <span
                className="h-2 w-2 rounded-full bg-amber-500 shrink-0"
                title={`${plausibilityCount} data quality issue${plausibilityCount !== 1 ? "s" : ""}`}
              />
            )}
          </div>

          {/* Birth alias */}
          {showBirthAlias && !isCompact && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
              AKA: {person.birthAlias}
            </p>
          )}

          {/* Meta row: nationality · age · hair · location */}
          <div
            className={cn(
              "mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground",
              isCompact ? "text-xs" : "text-sm",
            )}
          >
            {person.nationality && (
              <FlagImage code={person.nationality} size={isCompact ? 14 : 16} />
            )}
            {age !== null && (
              <span>{age} yrs</span>
            )}
            {person.naturalHairColor && (
              <span className="flex items-center gap-1">
                <Sparkles size={isCompact ? 10 : 12} className="shrink-0" />
                {person.naturalHairColor}
              </span>
            )}
            {person.location && (
              <span className="flex items-center gap-1">
                <MapPin size={isCompact ? 10 : 12} className="shrink-0" />
                {person.location}
              </span>
            )}
          </div>

          {/* Tags — comfortable only */}
          {!isCompact && person.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {person.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
              {person.tags.length > 3 && (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  +{person.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Profile completeness bar — absolutely positioned at bottom edge */}
        {person.completeness !== undefined && (
          <div
            className="absolute bottom-0 left-0 h-[3px] w-full"
            title={`Profile ${person.completeness}% complete`}
          >
            <div
              className={cn(
                "h-full transition-all",
                person.completeness < 40
                  ? "bg-red-500"
                  : person.completeness <= 70
                    ? "bg-amber-500"
                    : "bg-emerald-500",
              )}
              style={{ width: `${person.completeness}%` }}
            />
          </div>
        )}
      </div>
    </Link>
  );
}
