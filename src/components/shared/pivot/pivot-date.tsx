"use client";

import { Fragment, useState, type MouseEvent } from "react";
import { Check, Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { datePivotParts } from "@/lib/pivot-filter";
import { cn, formatPartialDateISO } from "@/lib/utils";
import { usePivot } from "./pivot-scope";
import { useCoarsePointer } from "./use-coarse-pointer";

// A card's date as yyyy-mm-dd where each part filters (2026-10-20): the year, the
// month of that year, the very day. With a mouse each part is its own target;
// with a finger the date opens a menu of the three. Outside a pivot scope — or
// without a date — it is the plain text it always was.

export type PivotDateProps = {
  date: Date | null | undefined;
  precision: string | null | undefined;
  className?: string;
};

/** The card is a link: a pivot must neither follow it nor reach it */
function stop(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}

export function PivotDate({ date, precision, className }: PivotDateProps) {
  const pivot = usePivot();
  const coarse = useCoarsePointer();
  const [menuOpen, setMenuOpen] = useState(false);
  const parts = datePivotParts(date, precision);
  const text = formatPartialDateISO(date, precision);

  if (!pivot || parts.length === 0) return text ? <span className={className}>{text}</span> : null;

  const active = parts.map((p) => pivot.isActive(pivot.dateFacet(p.value)));

  if (coarse) {
    return (
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              setMenuOpen((o) => !o);
            }}
            className={cn(
              "underline decoration-dotted underline-offset-2",
              active.some(Boolean) && "font-medium text-primary",
              className,
            )}
            aria-label={`Filter by date ${text}`}
          >
            {text}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-1" onClick={stop}>
          <p className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
            <Filter size={11} aria-hidden="true" /> {pivot.datePhrase}…
          </p>
          {parts.map((p, i) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={active[i]}
              onClick={() => {
                setMenuOpen(false);
                pivot.go(pivot.dateFacet(p.value));
              }}
              className={cn(
                "flex h-10 w-full items-center justify-between rounded-md px-2 text-sm",
                "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active[i] && "font-medium text-primary",
              )}
            >
              {p.title}
              {active[i] && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <span className={cn("inline-flex items-baseline", className)}>
      {parts.map((p, i) => (
        <Fragment key={p.value}>
          {i > 0 && <span aria-hidden="true">-</span>}
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              pivot.go(pivot.dateFacet(p.value));
            }}
            aria-pressed={active[i]}
            aria-label={active[i] ? `Remove the filter ${p.title}` : `${pivot.datePhrase} ${p.title}`}
            title={active[i] ? `Filtered to ${p.title} — click to remove` : `${pivot.datePhrase} ${p.title}`}
            className={cn(
              // A bigger target than the digits, without moving them
              "-mx-0.5 -my-1 cursor-pointer rounded px-0.5 py-1 transition-colors duration-150",
              "hover:bg-primary/10 hover:text-foreground hover:underline hover:underline-offset-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active[i] && "font-semibold text-primary",
            )}
          >
            {p.text}
          </button>
        </Fragment>
      ))}
    </span>
  );
}
