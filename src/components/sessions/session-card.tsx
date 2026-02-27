import Link from "next/link";
import { Building2, Users, ImageIcon, Clapperboard, User } from "lucide-react";
import { formatPartialDate } from "@/lib/utils";
import { SessionStatusBadge } from "./session-status-badge";
import type { getSessions } from "@/lib/services/session-service";

type SessionItem = Awaited<ReturnType<typeof getSessions>>[number];

type SessionCardProps = {
  session: SessionItem;
};

export function SessionCard({ session }: SessionCardProps) {
  const isReference = session.status === "REFERENCE";
  const participantCount = session.participants.length;
  const mediaCount = session._count.mediaItems;
  const setCount = session._count.setSessionLinks;
  const personName = session.person?.aliases[0]?.name ?? session.person?.icgId;

  return (
    <Link
      href={`/sessions/${session.id}`}
      className="group rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm transition-all hover:border-white/30 hover:bg-card/80 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            {isReference ? (
              <User size={16} className="text-primary" />
            ) : (
              <Clapperboard size={16} className="text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold group-hover:text-primary transition-colors">
              {session.name}
            </h3>
            {isReference && personName && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {personName}
              </p>
            )}
            {!isReference && session.date && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatPartialDate(session.date, session.datePrecision)}
              </p>
            )}
          </div>
        </div>
        <SessionStatusBadge status={session.status} />
      </div>

      {/* Label */}
      {session.label && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <Building2 size={10} />
            {session.label.name}
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        {!isReference && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Users size={12} />
            {participantCount}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ImageIcon size={12} />
          {mediaCount}
        </span>
        {!isReference && setCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {setCount} {setCount === 1 ? "set" : "sets"}
          </span>
        )}
      </div>
    </Link>
  );
}
