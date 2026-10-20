"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { applyPivot, isPivotActive, type PivotFacet } from "@/lib/pivot-filter";

// Which gallery a card's values filter (2026-10-20). /sets and /sessions wrap their
// grid in a scope that names their date params and their value param (channel or
// label); outside a scope — the tag page, say — the cards show plain text.

export type PivotScopeConfig = {
  /** The gallery's date-range params, e.g. releaseDateFrom / releaseDateTo */
  dateParams: { from: string; to: string };
  /** The comma-list param a card's channel or label filters */
  valueParam: string;
  /** "Sets released in" / "Sessions from" — before the date in tooltips */
  datePhrase: string;
};

const PivotScopeContext = createContext<PivotScopeConfig | null>(null);

export type PivotScopeProviderProps = {
  dateFrom: string;
  dateTo: string;
  valueParam: string;
  datePhrase: string;
  children: ReactNode;
};

export function PivotScopeProvider({ dateFrom, dateTo, valueParam, datePhrase, children }: PivotScopeProviderProps) {
  const value = useMemo(
    () => ({ dateParams: { from: dateFrom, to: dateTo }, valueParam, datePhrase }),
    [dateFrom, dateTo, valueParam, datePhrase],
  );
  return <PivotScopeContext.Provider value={value}>{children}</PivotScopeContext.Provider>;
}

export type Pivot = PivotScopeConfig & {
  isActive: (facet: PivotFacet) => boolean;
  /** Applies the click: a history step, so Back undoes it */
  go: (facet: PivotFacet) => void;
  dateFacet: (value: string) => PivotFacet;
  valueFacet: (value: string) => PivotFacet;
};

/** Null outside a scope — then nothing on the card filters */
export function usePivot(): Pivot | null {
  const scope = useContext(PivotScopeContext);
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  if (!scope) return null;
  return {
    ...scope,
    isActive: (facet) => isPivotActive(new URLSearchParams(params.toString()), facet),
    go: (facet) => {
      const next = applyPivot(new URLSearchParams(params.toString()), facet).toString();
      router.push(next ? `${pathname}?${next}` : pathname, { scroll: true });
    },
    dateFacet: (value) => ({ kind: "date", from: scope.dateParams.from, to: scope.dateParams.to, value }),
    valueFacet: (value) => ({ kind: "value", param: scope.valueParam, value }),
  };
}
