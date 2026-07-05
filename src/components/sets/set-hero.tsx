import Image from "next/image";
import Link from "next/link";
import { Camera, Film, FolderCheck, FolderOpen, FolderX } from "lucide-react";
import { focalStyle, formatPartialDateISO, computeProductionAge } from "@/lib/utils";
import { SetInlineTitle } from "@/components/sets/set-detail-header";
import { SetCompleteBadge } from "@/components/sets/set-complete-badge";
import { SetRating } from "@/components/sets/set-rating";
import { SetCastRail, type CastMember } from "@/components/sets/set-cast-rail";
import type { getSetById } from "@/lib/services/set-service";
import type { CoverPhotoData, HeadshotData } from "@/lib/services/media-service";
import type { ArchiveStatus } from "@/generated/prisma/client";
import { resolveCreditedAs } from "@/lib/sets/credited-as";

type SetData = NonNullable<Awaited<ReturnType<typeof getSetById>>>;

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
  const typeLabel = set.type === "video" ? "Video" : "Photo";
  const participantCount = set.participants.length;
  const primaryLabel = set.channel?.label;
  const primarySession = set.sessionLinks.find((l) => l.isPrimary)?.session ?? set.sessionLinks[0]?.session ?? null;

  // Build map: personId → the alias they were credited as on this set.
  // Precedence (ADR-0024): pinned alias → raw string → nothing. See resolveCreditedAs.
  const creditedAsMap = new Map<string, string>();
  for (const credit of set.creditsRaw) {
    if (!credit.resolvedPersonId || credit.resolutionStatus !== "RESOLVED") continue;
    const participant = set.participants.find((p) => p.personId === credit.resolvedPersonId);
    if (!participant) continue;
    const commonName = participant.person.aliases[0]?.name ?? null;
    const creditedAs = resolveCreditedAs(credit, commonName);
    if (creditedAs) creditedAsMap.set(credit.resolvedPersonId, creditedAs);
  }

  // Cast for the hero rail — age-at-shoot from the primary session (release-date
  // fallback). Plain serialisable shape so the client rail can render it.
  const productionDate = primarySession
    ? {
        date: primarySession.date,
        datePrecision: primarySession.datePrecision,
        dateIsConfirmed: primarySession.dateIsConfirmed,
      }
    : null;
  const cast: CastMember[] = set.participants.map((p) => {
    const name = p.person.aliases[0]?.name ?? p.person.icgId ?? "";
    const headshot = headshotMap.get(p.personId) ?? null;
    const eraInfo = participantEraMap?.[p.personId];
    return {
      personId: p.personId,
      name,
      creditedAs: creditedAsMap.get(p.personId) ?? null,
      age: computeProductionAge(
        p.person.birthdate,
        p.person.birthdatePrecision,
        productionDate?.date ?? null,
        productionDate?.datePrecision ?? "UNKNOWN",
        productionDate?.dateIsConfirmed ?? false,
        set.releaseDate,
        set.releaseDatePrecision,
      ),
      headshot: headshot
        ? { url: headshot.url, focalX: headshot.focalX, focalY: headshot.focalY }
        : null,
      era: eraInfo
        ? { label: eraInfo.eraLabel, isBaseline: eraInfo.isBaseline, count: eraInfo.eraCount }
        : null,
    };
  });

  const coverPanel = coverPhoto ? (
    <div className="relative mx-auto h-[250px] w-[180px] shrink-0 overflow-hidden rounded-xl sm:mx-0">
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
    <div className="mx-auto flex h-[250px] w-[180px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-entity-set/20 to-entity-set/5 sm:mx-0">
      <Film size={40} className="text-entity-set/40" />
    </div>
  );

  const cardContent = (
    <div className="flex flex-col gap-5 sm:flex-row">
      {coverPanel}

      {/* Metadata */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Title + rating */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <SetInlineTitle setId={set.id} title={set.title} />
          </div>
          <div className="shrink-0 pt-0.5">
            <SetRating setId={set.id} initialRating={set.rating} compact />
          </div>
        </div>

        {/* Metadata line: Date · Channel · Type icon */}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
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
          {(set.releaseDate || set.channel) && <span>·</span>}
          <span
            className="inline-flex items-center text-muted-foreground/80"
            title={`${typeLabel} set`}
            aria-label={`${typeLabel} set`}
          >
            {set.type === "video" ? <Film size={15} /> : <Camera size={15} />}
          </span>
        </div>

        {/* Separator */}
        <hr className="my-3 border-white/10" />

        {/* Cast rail */}
        <SetCastRail cast={cast} />
        {participantCount === 0 && (
          <p className="text-xs text-muted-foreground/50 italic">No participants</p>
        )}

        {/* Separator */}
        <hr className="my-3 border-white/10" />

        {/* Meta row — pushed to the bottom, quieter */}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
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
