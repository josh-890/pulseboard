"use client";

import { Folder, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PersonMediaUsage } from "@/lib/types";

const USAGE_ABBREV: Record<PersonMediaUsage, string> = {
  HEADSHOT: "HS",
  REFERENCE: "RF",
  BODY_MARK: "BM",
  BODY_MODIFICATION: "MD",
  COSMETIC_PROCEDURE: "CP",
  PROFILE: "PF",
  PORTFOLIO: "PT",
};

const USAGE_COLORS: Record<PersonMediaUsage, string> = {
  HEADSHOT: "bg-blue-500/90 text-white",
  REFERENCE: "bg-gray-500/90 text-white",
  BODY_MARK: "bg-amber-500/90 text-white",
  BODY_MODIFICATION: "bg-purple-500/90 text-white",
  COSMETIC_PROCEDURE: "bg-pink-500/90 text-white",
  PROFILE: "bg-green-500/90 text-white",
  PORTFOLIO: "bg-teal-500/90 text-white",
};

type MediaBadgeProps = {
  usage: PersonMediaUsage;
  slot: number | null;
};

export function MediaUsageBadge({ usage, slot }: MediaBadgeProps) {
  const abbrev = USAGE_ABBREV[usage];
  const label = slot !== null ? `${abbrev}:${slot}` : abbrev;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none shadow-sm",
        USAGE_COLORS[usage],
      )}
    >
      {label}
    </span>
  );
}

type MediaTagCountBadgeProps = {
  count: number;
};

export function MediaTagCountBadge({ count }: MediaTagCountBadgeProps) {
  if (count === 0) return null;
  return (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/90 px-1 text-[10px] font-bold leading-none text-gray-800 shadow-sm">
      {count}
    </span>
  );
}

export function MediaLinkIcon() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-white/80 shadow-sm">
      <Link2 size={10} className="text-gray-700" />
    </span>
  );
}

export function MediaCollectionIcon() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-white/80 shadow-sm">
      <Folder size={10} className="text-gray-700" />
    </span>
  );
}
