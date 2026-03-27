"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  getBrowseNav,
  getBrowseReturnUrl,
  extendBrowseContext,
  loadBrowseContext,
  truncateName,
} from "@/lib/browse-context";
import { loadMorePersons } from "@/lib/actions/person-actions";
import type { PersonFilters } from "@/lib/services/person-service";
import type { BrowseNav } from "@/lib/browse-context";

type BrowseNavBarProps = {
  personId: string;
};

export function BrowseNavBar({ personId }: BrowseNavBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [nav, setNav] = useState<BrowseNav | null>(null);
  const [isFetching, startTransition] = useTransition();

  // Read browse context on mount and when personId changes
  useEffect(() => {
    setNav(getBrowseNav(personId));
  }, [personId]);

  // Build href with current tab preserved
  const buildHref = useCallback(
    (targetId: string) => {
      const tab = searchParams.get("tab");
      return tab && tab !== "overview"
        ? `/people/${targetId}?tab=${tab}`
        : `/people/${targetId}`;
    },
    [searchParams],
  );

  // Boundary fetch: load next batch when at end of loaded items
  useEffect(() => {
    if (!nav?.isAtEnd || isFetching) return;

    const ctx = loadBrowseContext();
    if (!ctx?.nextCursor) return;

    startTransition(async () => {
      // Reconstruct PersonFilters from stored URL-param-keyed record
      const s = ctx.filters;
      const filters: PersonFilters = {
        q: s.q,
        status: s.status as PersonFilters["status"],
        naturalHairColor: s.hairColor,
        bodyType: s.bodyType,
        ethnicity: s.ethnicity,
        sort: s.sort as PersonFilters["sort"],
        completeness: s.completeness as PersonFilters["completeness"],
        bodyRegions: s.bodyRegions ? s.bodyRegions.split(",") : undefined,
        bodyRegionMatch: s.bodyRegionMatch as PersonFilters["bodyRegionMatch"],
      };
      const result = await loadMorePersons(
        filters,
        ctx.nextCursor!,
        ctx.slot,
      );
      const newIds = result.items.map((p) => p.id);
      const newNames = result.items.map((p) =>
        truncateName(p.commonAlias ?? p.icgId),
      );
      extendBrowseContext(newIds, newNames, result.nextCursor);
      // Re-read nav after extending
      setNav(getBrowseNav(personId));
    });
  }, [nav?.isAtEnd, isFetching, personId]);

  // Keyboard shortcuts: ← → Esc
  useEffect(() => {
    if (!nav) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Skip if focus is in an input, textarea, or select
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Skip if a dialog or lightbox is open
      if (document.querySelector("[role='dialog']")) return;
      if (document.querySelector("[data-lightbox-open]")) return;

      // Skip if content-editable
      if ((e.target as HTMLElement).isContentEditable) return;

      const currentNav = getBrowseNav(personId);
      if (!currentNav) return;

      if (e.key === "ArrowLeft" && currentNav.prevId) {
        e.preventDefault();
        router.push(buildHref(currentNav.prevId));
      } else if (e.key === "ArrowRight" && currentNav.nextId) {
        e.preventDefault();
        router.push(buildHref(currentNav.nextId));
      } else if (e.key === "Escape") {
        e.preventDefault();
        router.push(getBrowseReturnUrl());
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nav, personId, router, buildHref]);

  if (!nav) return null;

  const position = nav.index + 1;
  return (
    <div className="flex items-center gap-1.5 text-sm">
      {/* Prev button */}
      {nav.prevId ? (
        <Link
          href={buildHref(nav.prevId)}
          className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={`Previous: ${nav.prevName}`}
        >
          <ChevronLeft size={14} />
          <span className="hidden sm:inline max-w-[100px] truncate">
            {nav.prevName}
          </span>
        </Link>
      ) : (
        <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-muted-foreground/40 cursor-default">
          <ChevronLeft size={14} />
        </span>
      )}

      {/* Position indicator */}
      <span className="tabular-nums text-muted-foreground/70 text-xs min-w-[3rem] text-center">
        {position} / {nav.total}
      </span>

      {/* Next button */}
      {nav.nextId ? (
        <Link
          href={buildHref(nav.nextId)}
          className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={`Next: ${nav.nextName}`}
        >
          <span className="hidden sm:inline max-w-[100px] truncate">
            {nav.nextName}
          </span>
          <ChevronRight size={14} />
        </Link>
      ) : isFetching ? (
        <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-muted-foreground/40">
          <Loader2 size={14} className="animate-spin" />
        </span>
      ) : (
        <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-muted-foreground/40 cursor-default">
          <ChevronRight size={14} />
        </span>
      )}
    </div>
  );
}

/** Context-aware back link — restores filters + loaded count from browse context */
export function BrowseBackLink() {
  const [href] = useState(() => getBrowseReturnUrl());

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span aria-hidden="true">←</span>
      Back to People
    </Link>
  );
}
