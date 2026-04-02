import Image from "next/image";
import Link from "next/link";
import { Camera, Check, Circle, Film } from "lucide-react";
import { cn, focalStyle, formatPartialDate, getInitialsFromName } from "@/lib/utils";
import { SetInlineTitle } from "@/components/sets/set-detail-header";
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
    <div>
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
              style={{ marginLeft: i > 0 ? -10 : 0 }}
            >
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt={name}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full border-2 border-card object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-card bg-muted text-sm font-semibold text-muted-foreground">
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
  mediaCount: number;
};

export function SetHero({
  set,
  coverPhoto,
  headshotMap,
  backdropEnabled,
  mediaCount,
}: SetHeroProps) {
  const typeConfig = SET_TYPE_CONFIG[set.type] ?? SET_TYPE_CONFIG.photo;
  const participantCount = set.participants.length;
  const primaryLabel = set.channel?.labelMaps[0]?.label;

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
        {/* Line 1: Type · Date · Channel */}
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
              typeConfig.className,
            )}
          >
            {typeConfig.icon}
            {typeConfig.label}
          </span>
          {set.releaseDate && (
            <>
              <span>·</span>
              <span>{formatPartialDate(set.releaseDate, set.releaseDatePrecision)}</span>
            </>
          )}
          {set.channel && (
            <>
              <span>·</span>
              <Link
                href={`/channels/${set.channel.id}`}
                className="font-medium text-foreground/80 hover:text-foreground hover:underline underline-offset-2 transition-colors"
              >
                {set.channel.name}
              </Link>
            </>
          )}
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
          {set.isComplete ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check size={12} />
              Complete
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Circle size={12} />
              Incomplete
            </span>
          )}
          {set.isCompilation && (
            <>
              <span>·</span>
              <span className="text-sky-500 dark:text-sky-400">Compilation</span>
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
