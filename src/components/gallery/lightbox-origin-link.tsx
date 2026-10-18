"use client";

import Link from "next/link";
import { CornerUpLeft } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mediaOriginTarget } from "@/lib/media-origin-href";
import type { MediaItemOrigin } from "@/lib/types";
import { cn } from "@/lib/utils";
import { shortcutLabel } from "./lightbox-shortcuts";

// "Where you are" in a gallery gathered from everywhere (favorites, collections,
// tags, 2026-10-18): the set this photo comes from, one click — or O — back
// into it, opened on this photo. Without a set it leads to the reference
// person or the session. undefined = still asking, null = could not tell.

export type LightboxOriginLinkProps = {
  origin: MediaItemOrigin | null | undefined;
};

export function LightboxOriginLink({ origin }: LightboxOriginLinkProps) {
  if (origin === undefined) {
    return <span aria-hidden="true" className="h-6 w-28 shrink-0 animate-pulse rounded-full bg-white/10 motion-reduce:animate-none" />;
  }
  if (origin === null) return null;

  const target = mediaOriginTarget(origin);
  const more = origin.sets.length - 1;
  const lead = target.kind === "set" ? "Open in set" : target.kind === "person" ? "Open the person" : "Open the session";
  const people = origin.people.map((p) => p.name).join(", ");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={target.href}
          aria-label={`${lead}: ${target.label}`}
          aria-keyshortcuts={shortcutLabel("origin")}
          data-origin-kind={target.kind}
          className={cn(
            "inline-flex min-w-0 max-w-[14rem] items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/80 transition-colors duration-150 sm:max-w-[20rem]",
            "hover:border-emerald-500/40 hover:bg-emerald-500/15 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
          )}
        >
          <CornerUpLeft size={13} aria-hidden="true" className="shrink-0 opacity-70" />
          <span className="min-w-0 truncate font-medium">{target.label}</span>
          {more > 0 && <span className="shrink-0 text-white/50">+{more}</span>}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="dark max-w-xs">
        <span className="flex items-center gap-2">
          {lead}
          <kbd className="rounded border border-current/30 px-1 font-mono text-[10px] leading-4 opacity-80">{shortcutLabel("origin")}</kbd>
        </span>
        {people && <span className="block opacity-70">{people}</span>}
        {more > 0 && <span className="block opacity-70">Also in {more} more — see the info panel</span>}
      </TooltipContent>
    </Tooltip>
  );
}
