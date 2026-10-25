"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ListChecks } from "lucide-react";
import { rateStartHref } from "@/lib/rating-queue";

export type RateTheseButtonProps = {
  /** The list it walks — its filters as they are in the address */
  from: "sessions" | "sets";
};

// The way into the rating queue (2026-10-25): this list's sessions with models
// still to rate, one after the other, by channel then date.
export function RateTheseButton({ from }: RateTheseButtonProps) {
  const search = useSearchParams();
  const params = new URLSearchParams(search.toString());
  for (const k of ["loaded", "groupBy", "sort"]) params.delete(k);
  return (
    <Link
      href={rateStartHref(from, params.toString())}
      title={`Rate the intensity of the models in these ${from}, one session after the other — by channel, then date`}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/20 bg-card/60 px-3 text-sm font-medium backdrop-blur-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ListChecks size={15} aria-hidden="true" /> Rate these
    </Link>
  );
}
