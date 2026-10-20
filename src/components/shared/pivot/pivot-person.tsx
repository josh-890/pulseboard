"use client";

import { useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { usePivot } from "./pivot-scope";

// A person's avatar on a gallery card (2026-10-20): a click filters the gallery to
// them, hovering shows the bigger picture with a way to their profile. It replaces
// a tooltip, which could not hold the profile link. Outside a pivot scope the
// avatar does not filter, the preview stays.

export type PivotPersonProps = {
  personId: string;
  /** "Name (ICG-ID)" — the filter chip and the spoken name */
  display: string;
  /** The avatar as the card shows it */
  children: ReactNode;
  /** The hover preview: big headshot, name, age */
  preview: ReactNode;
  className?: string;
  style?: CSSProperties;
};

const OPEN_DELAY = 200;
const CLOSE_DELAY = 150;

export function PivotPerson({ personId, display, children, preview, className, style }: PivotPersonProps) {
  const pivot = usePivot();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function later(next: boolean, ms: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), ms);
  }
  const hoverProps = {
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === "mouse" && later(true, OPEN_DELAY),
    onPointerLeave: (e: React.PointerEvent) => e.pointerType === "mouse" && later(false, CLOSE_DELAY),
  };

  const facet = { kind: "person" as const, id: personId, display };
  const active = pivot?.isActive(facet) ?? false;

  function handleClick(e: MouseEvent) {
    // The card is a link: the avatar neither follows it nor reaches it
    e.preventDefault();
    e.stopPropagation();
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
    pivot?.go(facet);
  }

  const trigger = pivot ? (
    <button
      type="button"
      onClick={handleClick}
      onFocus={() => setOpen(true)}
      onBlur={() => later(false, CLOSE_DELAY)}
      aria-pressed={active}
      aria-label={active ? `Remove the filter ${display}` : `Show only ${display}`}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-0.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "[&>div:first-child]:ring-2 [&>div:first-child]:ring-primary",
        className,
      )}
      style={style}
      {...hoverProps}
    >
      {children}
    </button>
  ) : (
    <div className={cn("flex cursor-default flex-col items-center gap-0.5", className)} style={style} {...hoverProps}>
      {children}
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>{trigger}</PopoverAnchor>
      <PopoverContent
        side="top"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        {...hoverProps}
        className="flex w-auto flex-col items-center gap-2 rounded-xl border border-white/15 bg-card/90 p-2.5 shadow-xl backdrop-blur-md"
      >
        {preview}
        {pivot && (
          <p className="text-[10px] text-muted-foreground">{active ? "Click: show everyone" : "Click: only this person"}</p>
        )}
        <Link
          href={`/people/${personId}`}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open profile <ArrowRight size={11} aria-hidden="true" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
