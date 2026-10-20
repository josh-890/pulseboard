"use client";

import Image from "next/image";
import { focalStyle, getInitialsFromName } from "@/lib/utils";
import { PivotPerson } from "./pivot-person";

// A person's avatar as the set and session cards show it — headshot or initials,
// first name, age at the shoot — that filters the gallery to them (2026-10-20);
// hovering shows the big headshot, Name (ICG-ID) and the profile link.

const HOVER_SIZE = 64;

export type PivotPersonAvatarProps = {
  personId: string;
  icgId: string;
  name: string;
  headshot?: { url: string; focalX: number | null; focalY: number | null };
  size: number;
  age?: string;
};

export function PivotPersonAvatar({
  personId,
  icgId,
  name,
  headshot,
  size,
  age,
}: PivotPersonAvatarProps) {
  const initials = getInitialsFromName(name);

  return (
    <PivotPerson
      personId={personId}
      display={`${name} (${icgId})`}
      style={{ width: size + 8 }}
      preview={
        <>
          <div
            className="relative overflow-hidden rounded-full border-2 border-white/20"
            style={{ width: HOVER_SIZE, height: HOVER_SIZE }}
          >
            {headshot ? (
              <Image
                src={headshot.url}
                alt={name}
                fill
                className="object-cover"
                style={focalStyle(headshot.focalX, headshot.focalY)}
                unoptimized
                sizes={`${HOVER_SIZE}px`}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xl font-medium text-muted-foreground">
                {initials}
              </span>
            )}
          </div>
          <span className="text-xs font-medium text-popover-foreground">
            {name} <span className="text-muted-foreground">({icgId})</span>
          </span>
          {age && <span className="text-xs text-muted-foreground">{age}</span>}
        </>
      }
    >
      <div
        className="relative shrink-0 overflow-hidden rounded-full border border-white/20 bg-muted/60"
        style={{ width: size, height: size }}
      >
        {headshot ? (
          <Image
            src={headshot.url}
            alt={name}
            fill
            className="object-cover"
            style={focalStyle(headshot.focalX, headshot.focalY)}
            unoptimized
            sizes={`${size}px`}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[9px] font-medium text-muted-foreground">
            {initials}
          </span>
        )}
      </div>
      <span
        className="w-full truncate text-center text-[8px] leading-tight text-muted-foreground"
        title={name}
      >
        {name.split(" ")[0]}
      </span>
      {age && (
        <span className="text-[8px] leading-none text-muted-foreground/60">
          {age}
        </span>
      )}
    </PivotPerson>
  );
}
