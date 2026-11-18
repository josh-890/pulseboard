"use client";

import type { ReactNode } from "react";
import { openCover } from "@/lib/cover-viewer";
import { cn } from "@/lib/utils";

type HeroCoverOpenerProps = {
  mediaItemId: string | undefined;
  isPhoto: boolean | undefined;
  className?: string;
  children: ReactNode;
};

/**
 * The hero's cover as a button: a click shows it big — a photo in the gallery's
 * viewer (← → through the photos), cover art in the cover slot's viewer (its
 * actions: Cover, In photos …). Without a file id it is just the picture.
 */
export function HeroCoverOpener({ mediaItemId, isPhoto, className, children }: HeroCoverOpenerProps) {
  if (!mediaItemId) return <div className={className}>{children}</div>;
  return (
    <button
      type="button"
      onClick={() => openCover(mediaItemId, isPhoto ?? true)}
      className={cn(
        "cursor-zoom-in text-left transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label={isPhoto ? "Show the cover photo" : "Show the cover art"}
      title="Show the cover"
      data-testid="hero-cover"
    >
      {children}
    </button>
  );
}
