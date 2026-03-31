import Image from "next/image";
import Link from "next/link";
import { Camera, Check, Circle, Film } from "lucide-react";
import { cn, focalStyle, formatPartialDate, getInitialsFromName } from "@/lib/utils";
import { SetInlineTitle } from "@/components/sets/set-detail-header";
import { LabelEvidenceManager } from "@/components/sets/label-evidence-manager";
import { SetSessionManager } from "@/components/sets/set-session-manager";
import type { getSetById } from "@/lib/services/set-service";
import type { CoverPhotoData, HeadshotData } from "@/lib/services/media-service";

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

function CompletenessChip({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        done
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      )}
    >
      {done ? <Check size={10} /> : <Circle size={10} />}
      {label}
    </span>
  );
}

function ParticipantAvatars({
  participants,
  headshotMap,
}: {
  participants: Participant[];
  headshotMap: Map<string, HeadshotData>;
}) {
  if (participants.length === 0) return null;

  const MAX_VISIBLE = 5;
  const visible = participants.slice(0, MAX_VISIBLE);
  const overflow = participants.length - MAX_VISIBLE;
  const names = visible
    .map((p) => p.person.aliases[0]?.name ?? p.person.icgId)
    .join(" · ");
  const overflowText = overflow > 0 ? ` +${overflow}` : "";

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
        Participants
      </p>
      <div className="flex items-center">
        {visible.map((p, i) => {
          const name = p.person.aliases[0]?.name ?? p.person.icgId ?? "";
          const initials = getInitialsFromName(name);
          const photoUrl = headshotMap.get(p.personId)?.url ?? null;
          return (
            <Link
              key={p.personId}
              href={`/people/${p.personId}`}
              title={name}
              className="relative shrink-0 transition-transform hover:z-10 hover:scale-110"
              style={{ marginLeft: i > 0 ? -8 : 0 }}
            >
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt={name}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full border-2 border-card object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-muted text-xs font-semibold text-muted-foreground">
                  {initials}
                </div>
              )}
            </Link>
          );
        })}
        {overflow > 0 && (
          <span className="ml-2 text-xs text-muted-foreground">+{overflow}</span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {names}{overflowText}
      </p>
    </div>
  );
}

type SetHeroProps = {
  set: SetData;
  coverPhoto: CoverPhotoData | null;
  headshotMap: Map<string, HeadshotData>;
  backdropEnabled: boolean;
  hasPhotos: boolean;
  hasCredits: boolean;
  unresolvedCount: number;
  mediaCount: number;
};

export function SetHero({
  set,
  coverPhoto,
  headshotMap,
  backdropEnabled,
  hasPhotos,
  hasCredits,
  unresolvedCount,
  mediaCount,
}: SetHeroProps) {
  const typeConfig = SET_TYPE_CONFIG[set.type] ?? SET_TYPE_CONFIG.photo;
  const participantCount = set.participants.length;
  const sessionCount = set.sessionLinks.length;
  const hasLabel = set.labelEvidence.length > 0;
  const primaryLabel = set.channel?.labelMaps[0]?.label;

  const coverPanel = coverPhoto ? (
    <div className="relative h-[220px] w-[160px] shrink-0 overflow-hidden rounded-xl">
      <Image
        src={coverPhoto.url}
        alt=""
        fill
        className="object-cover"
        style={focalStyle(coverPhoto.focalX, coverPhoto.focalY)}
        unoptimized
        sizes="160px"
      />
    </div>
  ) : (
    <div className="flex h-[220px] w-[160px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-entity-set/20 to-entity-set/5">
      <Film size={40} className="text-entity-set/40" />
    </div>
  );

  const cardContent = (
    <div className="flex gap-5">
      {coverPanel}

      {/* Metadata */}
      <div className="min-w-0 flex-1">
        {/* Type badge + date */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              typeConfig.className,
            )}
          >
            {typeConfig.icon}
            {typeConfig.label}
          </span>
          {set.releaseDate && (
            <span className="text-sm text-muted-foreground">
              {formatPartialDate(set.releaseDate, set.releaseDatePrecision)}
            </span>
          )}
        </div>

        {/* Title */}
        <SetInlineTitle setId={set.id} title={set.title} />

        {/* Channel · primary label */}
        {set.channel && (
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">{set.channel.name}</span>
            {primaryLabel && (
              <>
                {" · "}
                <Link
                  href={`/labels/${primaryLabel.id}`}
                  className="hover:text-foreground hover:underline underline-offset-2 transition-colors"
                >
                  {primaryLabel.name}
                </Link>
              </>
            )}
          </p>
        )}

        {/* Label evidence */}
        <div className="mt-2">
          <LabelEvidenceManager
            setId={set.id}
            evidence={set.labelEvidence.map((ev) => ({
              setId: ev.setId,
              labelId: ev.labelId,
              evidenceType: ev.evidenceType,
              label: { id: ev.label.id, name: ev.label.name },
            }))}
          />
        </div>

        {/* Session links (full interactive manager) */}
        {set.sessionLinks.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sessions
            </p>
            <SetSessionManager
              setId={set.id}
              sessionLinks={set.sessionLinks.map((link) => ({
                setId: link.setId,
                sessionId: link.sessionId,
                isPrimary: link.isPrimary,
                session: {
                  id: link.session.id,
                  name: link.session.name,
                  status: link.session.status,
                  date: link.session.date,
                  datePrecision: link.session.datePrecision,
                },
              }))}
            />
          </div>
        )}

        {/* Participant avatars */}
        <ParticipantAvatars
          participants={set.participants}
          headshotMap={headshotMap}
        />

        {/* Completeness chips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <CompletenessChip done label="Title" />
          <CompletenessChip done={!!set.channel} label="Channel" />
          <CompletenessChip
            done={hasCredits && unresolvedCount === 0}
            label={unresolvedCount > 0 ? `Credits (${unresolvedCount} unresolved)` : "Credits"}
          />
          <CompletenessChip done={hasPhotos} label="Photos" />
          <CompletenessChip done={hasLabel} label="Label" />
        </div>

        {/* Stats */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{participantCount} {participantCount === 1 ? "participant" : "participants"}</span>
          <span>{sessionCount} {sessionCount === 1 ? "session" : "sessions"}</span>
          <span>{mediaCount} media</span>
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
