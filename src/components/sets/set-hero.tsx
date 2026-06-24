import Image from "next/image";
import Link from "next/link";
import { Camera, Film, FolderCheck, FolderOpen, FolderX } from "lucide-react";
import { cn, focalStyle, formatPartialDateISO, getInitialsFromName, computeProductionAge } from "@/lib/utils";
import { SetInlineTitle } from "@/components/sets/set-detail-header";
import { SetCompleteBadge } from "@/components/sets/set-complete-badge";
import { SetRating } from "@/components/sets/set-rating";
import type { getSetById } from "@/lib/services/set-service";
import type { CoverPhotoData, HeadshotData } from "@/lib/services/media-service";
import type { ArchiveStatus } from "@/generated/prisma/client";

type SetData = NonNullable<Awaited<ReturnType<typeof getSetById>>>;
type Participant = SetData["participants"][number];

type SetTypeConfig = {
  icon: React.ReactNode;
  label: string;
  className: string;
};

const SET_TYPE_CONFIG: Record<string, SetTypeConfig> = {
  photo: {
    icon: <Camera size={12} />,
    label: "Photo",
    className: "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  video: {
    icon: <Film size={12} />,
    label: "Video",
    className: "border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
};

type ProductionDateInfo = {
  date: Date | null;
  datePrecision: string;
  dateIsConfirmed: boolean;
};

function ParticipantAvatars({
  participants,
  headshotMap,
  productionDate,
  fallbackDate,
  fallbackPrecision,
  creditedAsMap,
  eraMap,
}: {
  participants: Participant[];
  headshotMap: Map<string, HeadshotData>;
  productionDate: ProductionDateInfo | null;
  fallbackDate: Date | null;
  fallbackPrecision: string;
  creditedAsMap: Map<string, string>;
  eraMap?: Record<string, SetParticipantEraInfo>;
}) {
  if (participants.length === 0) return null;

  const MAX_VISIBLE = 5;
  const visible = participants.slice(0, MAX_VISIBLE);
  const overflow = participants.length - MAX_VISIBLE;

  return (
    <div className="flex flex-wrap items-start gap-2">
      {visible.map((p) => {
        const name = p.person.aliases[0]?.name ?? p.person.icgId ?? "";
        const firstName = name.split(" ")[0];
        const initials = getInitialsFromName(name);
        const headshot = headshotMap.get(p.personId) ?? null;
        const photoUrl = headshot?.url ?? null;
        const creditedAs = creditedAsMap.get(p.personId) ?? null;
        const age = computeProductionAge(
          p.person.birthdate,
          p.person.birthdatePrecision,
          productionDate?.date ?? null,
          productionDate?.datePrecision ?? "UNKNOWN",
          productionDate?.dateIsConfirmed ?? false,
          fallbackDate,
          fallbackPrecision,
        );
        const eraInfo = eraMap?.[p.personId];
        const eraSuffix = eraInfo
          ? eraInfo.eraCount > 1
            ? ` · across ${eraInfo.eraCount} eras`
            : eraInfo.eraLabel
              ? ` · ${eraInfo.isBaseline ? "Baseline" : eraInfo.eraLabel}`
              : ""
          : "";
        const title = (creditedAs ? `${name} (credited as: ${creditedAs})` : name) + eraSuffix;
        return (
          <Link
            key={p.personId}
            href={`/people/${p.personId}`}
            className="flex flex-col items-center gap-0.5 transition-transform hover:scale-105"
            style={{ width: 56 }}
            title={title}
          >
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt={name}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full border-2 border-card object-cover"
                style={focalStyle(headshot?.focalX ?? null, headshot?.focalY ?? null)}
                unoptimized
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-card bg-muted text-sm font-semibold text-muted-foreground">
                {initials}
              </div>
            )}
            <span className="w-full truncate text-center text-[9px] leading-tight text-muted-foreground">
              {firstName}
            </span>
            {creditedAs && (
              <span className="w-full truncate text-center text-[8px] leading-none text-muted-foreground/50 italic">
                as: {creditedAs.split(" ")[0]}
              </span>
            )}
            {age && (
              <span className="text-[9px] leading-none text-muted-foreground/60">
                {age}
              </span>
            )}
            {eraInfo && eraInfo.eraCount > 0 && (
              <span
                className={
                  eraInfo.eraCount > 1
                    ? "w-full truncate text-center text-[8px] leading-none text-muted-foreground/50 italic"
                    : "w-full truncate text-center text-[8px] leading-none text-amber-600/80 dark:text-amber-400/80"
                }
                title={eraInfo.eraCount > 1 ? "Multiple eras across this set's sessions" : "Linked Era"}
              >
                {eraInfo.eraCount > 1
                  ? `${eraInfo.eraCount} eras`
                  : eraInfo.isBaseline
                    ? "Baseline"
                    : eraInfo.eraLabel}
              </span>
            )}
          </Link>
        );
      })}
      {overflow > 0 && (
        <div className="flex flex-col items-center gap-0.5" style={{ width: 56 }}>
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-card bg-muted text-xs text-muted-foreground">
            +{overflow}
          </div>
        </div>
      )}
    </div>
  );
}

// ADR-0004: per-Set participant Era resolution. Single-era set → label + a
// "baseline" flag for styling; compilation set with multiple eras → eraCount > 1
// and label === null. Built by `getSetParticipantEraMap` on the server.
type SetParticipantEraInfo = {
  eraLabel: string | null;
  isBaseline: boolean;
  eraCount: number;
};

type SetHeroProps = {
  set: SetData;
  coverPhoto: CoverPhotoData | null;
  headshotMap: Map<string, HeadshotData>;
  participantEraMap?: Record<string, SetParticipantEraInfo>;
  backdropEnabled: boolean;
  mediaCount: number;
  archiveStatus?: ArchiveStatus | "UNKNOWN";
  archiveFileCount?: number | null;
  hasSuggestion?: boolean;
  // Optional override for the OK chip — when provided, replaces the static
  // green chip with a clickable element (the chip-sheet wrapper). The page
  // passes this in when an archive link exists, so users can manage even a
  // healthy link without surfacing the full panel inline.
  archiveOkChip?: React.ReactNode;
};

export function SetHero({
  set,
  coverPhoto,
  headshotMap,
  participantEraMap,
  backdropEnabled,
  mediaCount,
  archiveStatus,
  archiveFileCount,
  hasSuggestion = false,
  archiveOkChip,
}: SetHeroProps) {
  const typeConfig = SET_TYPE_CONFIG[set.type] ?? SET_TYPE_CONFIG.photo;
  const participantCount = set.participants.length;
  const primaryLabel = set.channel?.label;
  const primarySession = set.sessionLinks.find((l) => l.isPrimary)?.session ?? set.sessionLinks[0]?.session ?? null;

  // Build map: personId → rawName (only when rawName differs from common alias)
  const creditedAsMap = new Map<string, string>();
  for (const credit of set.creditsRaw) {
    if (!credit.resolvedPersonId || credit.resolutionStatus !== "RESOLVED") continue;
    const participant = set.participants.find((p) => p.personId === credit.resolvedPersonId);
    if (!participant) continue;
    const commonName = participant.person.aliases[0]?.name ?? null;
    if (credit.rawName && credit.rawName !== commonName) {
      creditedAsMap.set(credit.resolvedPersonId, credit.rawName);
    }
  }

  const coverPanel = coverPhoto ? (
    <div className="relative h-[250px] w-[180px] shrink-0 overflow-hidden rounded-xl">
      <Image
        src={coverPhoto.url}
        alt=""
        fill
        className="object-cover"
        style={focalStyle(coverPhoto.focalX, coverPhoto.focalY)}
        unoptimized
        sizes="180px"
      />
    </div>
  ) : (
    <div className="flex h-[250px] w-[180px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-entity-set/20 to-entity-set/5">
      <Film size={40} className="text-entity-set/40" />
    </div>
  );

  const cardContent = (
    <div className="flex gap-5">
      {coverPanel}

      {/* Metadata */}
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Line 1: Date · Channel · Type pill */}
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {set.releaseDate && (
            <span>{formatPartialDateISO(set.releaseDate, set.releaseDatePrecision)}</span>
          )}
          {set.channel && (
            <>
              {set.releaseDate && <span>·</span>}
              <Link
                href={`/channels/${set.channel.id}`}
                className="font-medium text-foreground/80 hover:text-foreground hover:underline underline-offset-2 transition-colors"
              >
                {set.channel.name}
              </Link>
            </>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
              typeConfig.className,
            )}
          >
            {typeConfig.icon}
            {typeConfig.label}
          </span>
        </div>

        {/* Line 2: Title */}
        <div className="mt-1">
          <SetInlineTitle setId={set.id} title={set.title} />
        </div>

        {/* Separator */}
        <hr className="my-3 border-white/10" />

        {/* People block */}
        <ParticipantAvatars
          participants={set.participants}
          headshotMap={headshotMap}
          productionDate={primarySession ? {
            date: primarySession.date,
            datePrecision: primarySession.datePrecision,
            dateIsConfirmed: primarySession.dateIsConfirmed,
          } : null}
          fallbackDate={set.releaseDate}
          fallbackPrecision={set.releaseDatePrecision}
          creditedAsMap={creditedAsMap}
          eraMap={participantEraMap}
        />
        {participantCount === 0 && (
          <p className="text-xs text-muted-foreground/50 italic">No participants</p>
        )}

        {/* Separator */}
        <hr className="my-3 border-white/10" />

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{mediaCount} media</span>
          {set.imageCount != null && (
            <>
              <span>·</span>
              <span>{set.imageCount} images in set</span>
            </>
          )}
          {set.videoLength && (
            <>
              <span>·</span>
              <span>{set.videoLength}</span>
            </>
          )}
          {primaryLabel && (
            <>
              <span>·</span>
              <Link
                href={`/labels/${primaryLabel.id}`}
                className="hover:text-foreground hover:underline underline-offset-2 transition-colors"
              >
                {primaryLabel.name}
              </Link>
            </>
          )}
          <span>·</span>
          <SetCompleteBadge setId={set.id} isComplete={set.isComplete} />
          {archiveStatus === "OK" && (archiveOkChip ?? (
            <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[11px] text-green-600 dark:text-green-400">
              <FolderCheck size={11} />
              In archive{archiveFileCount != null ? ` · ${archiveFileCount} files` : ""}
            </span>
          ))}
          {hasSuggestion && archiveStatus !== "OK" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
              <FolderOpen size={11} />
              Match suggested
            </span>
          )}
          {archiveStatus === "MISSING" && !hasSuggestion && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-600 dark:text-red-400">
              <FolderX size={11} />
              Missing from archive
            </span>
          )}
          {archiveStatus === "CHANGED" && !hasSuggestion && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
              <FolderCheck size={11} />
              Archive changed
            </span>
          )}
          {archiveStatus === "INCOMPLETE" && !hasSuggestion && (
            <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[11px] text-orange-600 dark:text-orange-400">
              <FolderX size={11} />
              Archive incomplete
            </span>
          )}
          {set.isCompilation && (
            <>
              <span>·</span>
              <span className="text-sky-500 dark:text-sky-400">Compilation</span>
            </>
          )}
          {set.externalId && (
            <>
              <span>·</span>
              <span className="text-muted-foreground/70 font-mono text-xs">ID: {set.externalId}</span>
            </>
          )}
        </div>

        {/* Subjective star rating — mirrors Person.rating UI */}
        <div className="mt-auto pt-3">
          <SetRating setId={set.id} initialRating={set.rating} />
        </div>
      </div>
    </div>
  );

  if (backdropEnabled && coverPhoto) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/20 shadow-md">
        <Image
          src={coverPhoto.url}
          alt=""
          fill
          aria-hidden
          className="object-cover blur-2xl scale-110"
          style={{ opacity: 0.35 }}
          unoptimized
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-black/60" aria-hidden />
        {/* Card content — own surface guarantees text contrast */}
        <div className="relative z-10 p-4">
          <div className="rounded-xl bg-card/80 p-5 backdrop-blur-sm">
            {cardContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
      {cardContent}
    </div>
  );
}
