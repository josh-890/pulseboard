import Image from "next/image";
import Link from "next/link";
import { Building2, Clapperboard, FolderKanban } from "lucide-react";
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
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
        Contributors
      </p>
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

function CoverPanel({ coverPhoto, isBackdrop }: { coverPhoto: CoverPhotoData | null; isBackdrop?: boolean }) {
  const panelClass = cn(
    "relative shrink-0 overflow-hidden rounded-xl bg-muted/30",
    isBackdrop ? "h-[220px] w-[160px]" : "h-[220px] w-[160px]",
  );

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
          sizes="160px"
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

  const cardContent = (
    <div className="flex gap-5">
      <CoverPanel coverPhoto={coverPhoto} />

      {/* Metadata */}
      <div className="min-w-0 flex-1">
        {/* Status + date row */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {session.status === "DRAFT" && (
            <>
              <SessionStatusBadge status={session.status} />
              <SessionStatusToggle sessionId={session.id} status={session.status} />
            </>
          )}
          {session.date && (
            <span className="text-sm text-muted-foreground">
              {formatPartialDate(session.date, session.datePrecision)}
            </span>
          )}
        </div>

        {/* Title */}
        <SessionInlineTitle sessionId={session.id} title={session.name} />

        {/* Pill links */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {session.label && (
            <Link
              href={`/labels/${session.label.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-muted/60 px-3 py-1 text-sm font-medium transition-colors hover:bg-muted/80 hover:text-primary"
            >
              <Building2 size={12} />
              {session.label.name}
            </Link>
          )}
          {session.project && (
            <Link
              href={`/projects/${session.project.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-muted/60 px-3 py-1 text-sm font-medium transition-colors hover:bg-muted/80 hover:text-primary"
            >
              <FolderKanban size={12} />
              {session.project.name}
            </Link>
          )}
        </div>

        {/* Contributor avatars */}
        <ContributorAvatars
          contributions={session.contributions}
          headshotMap={headshotMap}
        />

        {/* Stats */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{contributorCount} {contributorCount === 1 ? "contributor" : "contributors"}</span>
          <span>{setCount} {setCount === 1 ? "set" : "sets"}</span>
          <span>{mediaCount} media</span>
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
