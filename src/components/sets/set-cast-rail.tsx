"use client";

import Image from "next/image";
import Link from "next/link";
import { cn, focalStyle, getInitialsFromName } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const HOVER_SIZE = 64;
const AVATAR_SIZE = 64;

type HeadshotData = { url: string; focalX: number | null; focalY: number | null };

export type CastMember = {
  personId: string;
  name: string;
  creditedAs: string | null;
  age: string;
  headshot: HeadshotData | null;
  era: { label: string | null; isBaseline: boolean; count: number } | null;
};

/**
 * Horizontal, scroll-snap rail of cast cards for the set hero. Each card is a
 * link to the person: circular avatar on the left, a vertical text stack
 * (common name wrapping to 2 lines / "as <alias>" / age) on the right. The card
 * is width-capped so long names wrap instead of stretching; the full name and
 * credited-as are always available via the hover tooltip (64px headshot).
 */
export function SetCastRail({ cast }: { cast: CastMember[] }) {
  if (cast.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex gap-3 overflow-x-auto pb-1 snap-x">
        {cast.map((m) => {
          const initials = getInitialsFromName(m.name);
          return (
            <Tooltip key={m.personId}>
              <TooltipTrigger asChild>
                <Link
                  href={`/people/${m.personId}`}
                  className="group flex w-[116px] shrink-0 snap-start flex-col items-center gap-1 rounded-xl border border-white/15 bg-card/80 p-2.5 shadow-sm transition-colors hover:border-white/30 hover:bg-card"
                >
                  <div
                    className="relative shrink-0 overflow-hidden rounded-full border-2 border-card bg-muted/60"
                    style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                  >
                    {m.headshot ? (
                      <Image
                        src={m.headshot.url}
                        alt={m.name}
                        fill
                        className="object-cover"
                        style={focalStyle(m.headshot.focalX, m.headshot.focalY)}
                        unoptimized
                        sizes={`${AVATAR_SIZE}px`}
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                        {initials}
                      </span>
                    )}
                  </div>

                  <div className="mt-0.5 w-full text-center">
                    <p className="line-clamp-2 text-sm font-medium leading-tight text-foreground [overflow-wrap:anywhere]">
                      {m.name}
                    </p>
                    {m.creditedAs && (
                      <p className="line-clamp-1 text-xs italic leading-tight text-muted-foreground/70">
                        as {m.creditedAs}
                      </p>
                    )}
                    {m.age && (
                      <p className="text-xs leading-tight text-muted-foreground/60">{m.age}</p>
                    )}
                    {m.era && m.era.count > 0 && (
                      <p
                        className={cn(
                          "truncate text-[11px] leading-tight",
                          m.era.count > 1
                            ? "italic text-muted-foreground/50"
                            : "text-amber-600/80 dark:text-amber-400/80",
                        )}
                      >
                        {m.era.count > 1
                          ? `${m.era.count} eras`
                          : m.era.isBaseline
                            ? "Baseline"
                            : m.era.label}
                      </p>
                    )}
                  </div>
                </Link>
              </TooltipTrigger>

              <TooltipContent
                side="top"
                sideOffset={6}
                className="flex flex-col items-center gap-2 rounded-xl border border-white/15 bg-card/90 p-2.5 shadow-xl backdrop-blur-md [&>svg]:fill-primary/35"
              >
                <div
                  className="relative overflow-hidden rounded-full border-2 border-white/20"
                  style={{ width: HOVER_SIZE, height: HOVER_SIZE }}
                >
                  {m.headshot ? (
                    <Image
                      src={m.headshot.url}
                      alt={m.name}
                      fill
                      className="object-cover"
                      style={focalStyle(m.headshot.focalX, m.headshot.focalY)}
                      unoptimized
                      sizes={`${HOVER_SIZE}px`}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xl font-medium text-muted-foreground">
                      {initials}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium text-popover-foreground">{m.name}</span>
                {m.creditedAs && (
                  <span className="text-xs italic text-muted-foreground">as {m.creditedAs}</span>
                )}
                {m.age && <span className="text-xs text-muted-foreground">{m.age}</span>}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
