"use client";

import Image from "next/image";
import Link from "next/link";
import { Building2, Users, ImageIcon, Clapperboard, User } from "lucide-react";
import { cn, formatPartialDate } from "@/lib/utils";
import { useDensity } from "@/components/layout/density-provider";
import { SessionStatusBadge, SessionTypeBadge } from "./session-status-badge";
import type { getSessions } from "@/lib/services/session-service";

type SessionItem = Awaited<ReturnType<typeof getSessions>>[number];

type SessionCardProps = {
  session: SessionItem;
  photoUrl?: string;
};

export function SessionCard({ session, photoUrl }: SessionCardProps) {
  const { density } = useDensity();
  const isCompact = density === "compact";
  const isReference = session.type === "REFERENCE";
  const participantCount = session.contributions.length;
  const mediaCount = session._count.mediaItems;
  const setCount = session._count.setSessionLinks;
  const personName = session.person?.aliases[0]?.name ?? session.person?.icgId;

  if (isCompact) {
    return (
      <Link
        href={`/sessions/${session.id}`}
        prefetch={false}
        className="group block focus-visible:outline-none"
      >
        <div
          className={cn(
            "flex overflow-hidden rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm",
            "transition-all duration-200",
            "hover:border-white/30 hover:bg-card/90 hover:shadow-lg hover:-translate-y-0.5",
            "active:scale-[0.98] active:shadow-sm active:translate-y-0",
            "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
            "flex-col sm:flex-row sm:h-[100px]",
          )}
        >
          {/* Thumbnail */}
          <div className="relative shrink-0 overflow-hidden bg-muted/30 h-[100px] w-full sm:h-full sm:w-[100px]">
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt={session.name}
                fill
                className="object-cover object-center"
                unoptimized
                sizes="100px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                {isReference ? <User size={20} /> : <Clapperboard size={20} />}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden p-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-xs font-semibold group-hover:text-primary transition-colors">
                {session.name}
              </h3>
              <div className="flex items-center gap-1 shrink-0">
                <SessionTypeBadge type={session.type} />
                <SessionStatusBadge status={session.status} />
              </div>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              {session.label && (
                <span className="truncate">
                  <Building2 size={9} className="mr-0.5 inline" />
                  {session.label.name}
                </span>
              )}
              <span className="flex items-center gap-0.5">
                <ImageIcon size={9} />
                {mediaCount}
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/sessions/${session.id}`}
      prefetch={false}
      className="group block focus-visible:outline-none"
    >
      <div
        className={cn(
          "flex overflow-hidden rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm",
          "transition-all duration-200",
          "hover:border-white/30 hover:bg-card/90 hover:shadow-lg hover:-translate-y-0.5",
          "active:scale-[0.98] active:shadow-sm active:translate-y-0",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
          "flex-col sm:flex-row sm:h-[160px]",
        )}
      >
        {/* Thumbnail */}
        <div className="relative shrink-0 overflow-hidden bg-muted/30 h-[120px] w-full sm:h-full sm:w-[160px]">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={session.name}
              fill
              className="object-cover object-center"
              unoptimized
              sizes="160px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
              {isReference ? <User size={28} /> : <Clapperboard size={28} />}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden p-3">
          {/* Name + badges */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 font-semibold leading-tight text-base group-hover:text-primary transition-colors">
              {session.name}
            </h3>
            <div className="flex items-center gap-1 shrink-0">
              <SessionTypeBadge type={session.type} />
              <SessionStatusBadge status={session.status} />
            </div>
          </div>

          {/* Subtitle: person name or date */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {isReference && personName && (
              <span className="truncate">{personName}</span>
            )}
            {!isReference && session.date && (
              <span>{formatPartialDate(session.date, session.datePrecision)}</span>
            )}
          </div>

          {/* Label */}
          {session.label && (
            <div className="mt-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Building2 size={10} />
                {session.label.name}
              </span>
            </div>
          )}

          {/* Stats */}
          <div className="mt-1.5 flex flex-wrap gap-2">
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
        </div>
      </div>
    </Link>
  );
}
