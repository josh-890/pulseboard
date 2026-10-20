"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePivot } from "./pivot-scope";

// A card's channel or label that filters the gallery by it (2026-10-20). Plain
// text outside a pivot scope or without an id.

export type PivotValueProps = {
  /** The value's id, e.g. the channel id */
  value: string | null | undefined;
  /** As shown and spoken, e.g. the channel name */
  name: string;
  children: ReactNode;
  className?: string;
};

export function PivotValue({ value, name, children, className }: PivotValueProps) {
  const pivot = usePivot();
  if (!pivot || !value) return <span className={className}>{children}</span>;
  const facet = pivot.valueFacet(value);
  const active = pivot.isActive(facet);
  return (
    <button
      type="button"
      onClick={(e) => {
        // The card is a link: a pivot must neither follow it nor reach it
        e.preventDefault();
        e.stopPropagation();
        pivot.go(facet);
      }}
      aria-pressed={active}
      aria-label={active ? `Remove the filter ${name}` : `Show only ${name}`}
      title={active ? `Filtered to ${name} — click to remove` : `Show only ${name}`}
      className={cn(
        "-mx-0.5 -my-1 min-w-0 cursor-pointer rounded px-0.5 py-1 text-left transition-colors duration-150",
        "hover:bg-primary/10 hover:text-foreground hover:underline hover:underline-offset-2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "font-semibold text-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}
