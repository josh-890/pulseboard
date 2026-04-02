import Image from "next/image";
import Link from "next/link";
import { Clapperboard, FolderKanban } from "lucide-react";
import { cn, focalStyle, formatPartialDate, getInitialsFromName } from "@/lib/utils";
import { SessionStatusBadge } from "@/components/sessions/session-status-badge";
import { SessionStatusToggle } from "@/components/sessions/session-status-toggle";
import { SessionInlineTitle } from "@/components/sessions/session-detail-header";
import type { getSessionById } from "@/lib/services/session-service";
import type { CoverPhotoData, HeadshotData } from "@/lib/services/media-service";

type Session = NonNullable<Awaited<ReturnType<typeof getSessionById>>>;

type SessionHeroProps = {
  session: Session;
  coverPhoto: CoverPhotoData | null;
  headshotMap: Map<string, HeadshotData>;
  backdropEnabled: boolean;
};

function ContributorAvatars({
  contributions,
  headshotMap,
}: {
  contributions: Session["contributions"];
  headshotMap: Map<string, HeadshotData>;
}) {
  if (contributions.length === 0) return null;

  const MAX_VISIBLE = 5;
  const visible = contributions.slice(0, MAX_VISIBLE);
  const overflow = contributions.length - MAX_VISIBLE;
  const names = visible
    .map((c) => c.person.aliases[0]?.name ?? c.person.icgId)
    .join(" · ");
  const overflowText = overflow > 0 ? ` +${overflow}` : "";

  return (
    <div>
      <div className="flex items-center">
        {visible.map((c, i) => {
          const name = c.person.aliases[0]?.name ?? c.person.icgId ?? "";
          const initials = getInitialsFromName(name);
          const photoUrl = headshotMap.get(c.personId)?.url ?? null;
          return (
            <Link
              key={c.personId}
              href={`/people/${c.personId}`}
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

function CoverPanel({ coverPhoto }: { coverPhoto: CoverPhotoData | null }) {
  const panelClass = "relative h-[250px] w-[180px] shrink-0 overflow-hidden rounded-xl";

  if (coverPhoto) {
    return (
      <div className={panelClass}>
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
    );
  }

  return (
    <div
      className={cn(
        panelClass,
        "flex items-center justify-center bg-gradient-to-br from-entity-session/20 to-entity-session/5",
      )}
    >
      <Clapperboard size={40} className="text-entity-session/40" />
    </div>
  );
}

export function SessionHero({
  session,
  coverPhoto,
  headshotMap,
  backdropEnabled,
}: SessionHeroProps) {
  const contributorCount = session.contributions.length;
  const mediaCount = session._count.mediaItems;
  const setCount = session.setSessionLinks.length;

  const photoSetCount = session.setSessionLinks.filter((l) => l.set.type === "photo").length;
  const videoSetCount = session.setSessionLinks.filter((l) => l.set.type === "video").length;
  const isMixed = photoSetCount > 0 && videoSetCount > 0;
  const setLabel = isMixed
    ? `${setCount} ${setCount === 1 ? "set" : "sets"} (${photoSetCount} photo, ${videoSetCount} video)`
    : setCount === 1
      ? `1 ${videoSetCount === 1 ? "video " : ""}set`
      : `${setCount} ${videoSetCount > 0 && photoSetCount === 0 ? "video " : ""}sets`;

  const cardContent = (
    <div className="flex gap-5">
      <CoverPanel coverPhoto={coverPhoto} />

      {/* Metadata */}
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Line 1: Date · Label */}
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {session.date && (
            <span>{formatPartialDate(session.date, session.datePrecision)}</span>
          )}
          {session.date && session.label && <span>·</span>}
          {session.label && (
            <Link
              href={`/labels/${session.label.id}`}
              className="font-medium text-foreground/80 hover:text-foreground hover:underline underline-offset-2 transition-colors"
            >
              {session.label.name}
            </Link>
          )}
        </div>

        {/* Line 2: Title */}
        <div className="mt-1">
          <SessionInlineTitle sessionId={session.id} title={session.name} />
        </div>

        {/* Line 3: Status badge + toggle */}
        <div className="mt-2 flex items-center gap-2">
          {session.status === "DRAFT" && (
            <>
              <SessionStatusBadge status={session.status} />
              <SessionStatusToggle sessionId={session.id} status={session.status} />
            </>
          )}
        </div>

        {/* Separator */}
        <hr className="my-3 border-white/10" />

        {/* People block */}
        <ContributorAvatars
          contributions={session.contributions}
          headshotMap={headshotMap}
        />
        {contributorCount === 0 && (
          <p className="text-xs text-muted-foreground/50 italic">No contributors</p>
        )}

        {/* Separator */}
        <hr className="my-3 border-white/10" />

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{mediaCount} media</span>
          <span>·</span>
          <span>{setLabel}</span>
          {session.project && (
            <>
              <span>·</span>
              <Link
                href={`/projects/${session.project.id}`}
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline underline-offset-2 transition-colors"
              >
                <FolderKanban size={12} />
                {session.project.name}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (backdropEnabled && coverPhoto) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/20 shadow-md">
        {/* Blurred backdrop */}
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
