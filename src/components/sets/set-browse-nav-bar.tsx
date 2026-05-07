"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  getBrowseNav,
  getBrowseReturnUrl,
  extendBrowseContext,
  loadBrowseContext,
  truncateName,
  SET_BROWSE_KEY,
} from "@/lib/browse-context";
import { loadMoreSets } from "@/lib/actions/set-actions";
import type { SetFilters } from "@/lib/services/set-service";
import type { BrowseNav } from "@/lib/browse-context";

type SetBrowseNavBarProps = {
  setId: string;
};

export function SetBrowseNavBar({ setId }: SetBrowseNavBarProps) {
  const router = useRouter();
  const [nav, setNav] = useState<BrowseNav | null>(null);
  const [isFetching, startTransition] = useTransition();

  useEffect(() => {
    setNav(getBrowseNav(setId, SET_BROWSE_KEY));
  }, [setId]);

  const buildHref = useCallback(
    (targetId: string) => `/sets/${targetId}`,
    [],
  );

  // Boundary fetch: load next batch when at end of loaded items
  useEffect(() => {
    if (!nav?.isAtEnd || isFetching) return;

    const ctx = loadBrowseContext(SET_BROWSE_KEY);
    if (!ctx?.nextCursor) return;

    startTransition(async () => {
      const s = ctx.filters;
      const filters: SetFilters = {
        q: s.q,
        type: (s.type as SetFilters["type"]) ?? "all",
        channelId: s.channel,
        labelId: s.label,
        personId: s.personId,
        sort: s.sort as SetFilters["sort"],
        releaseDateFrom: s.releaseDateFrom ? new Date(s.releaseDateFrom) : undefined,
        releaseDateTo: s.releaseDateTo ? new Date(s.releaseDateTo) : undefined,
        createdFrom: s.createdFrom ? new Date(s.createdFrom) : undefined,
        createdTo: s.createdTo ? new Date(s.createdTo) : undefined,
      };
      const result = await loadMoreSets(filters, ctx.nextCursor!);
      const newIds = result.items.map((s) => s.id);
      const newNames = result.items.map((s) => truncateName(s.title));
      extendBrowseContext(newIds, newNames, result.nextCursor, SET_BROWSE_KEY);
      setNav(getBrowseNav(setId, SET_BROWSE_KEY));
    });
  }, [nav?.isAtEnd, isFetching, setId]);

  // Keyboard shortcuts: ← → Esc
  useEffect(() => {
    if (!nav) return;

    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (document.querySelector("[role='dialog']")) return;
      if (document.querySelector("[data-lightbox-open]")) return;
      if ((e.target as HTMLElement).isContentEditable) return;

      const currentNav = getBrowseNav(setId, SET_BROWSE_KEY);
      if (!currentNav) return;

      if (e.key === "ArrowLeft" && currentNav.prevId) {
        e.preventDefault();
        router.push(buildHref(currentNav.prevId));
      } else if (e.key === "ArrowRight" && currentNav.nextId) {
        e.preventDefault();
        router.push(buildHref(currentNav.nextId));
      } else if (e.key === "Escape") {
        e.preventDefault();
        router.push(getBrowseReturnUrl("/sets", SET_BROWSE_KEY));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nav, setId, router, buildHref]);

  if (!nav) return null;

  const position = nav.index + 1;
  return (
    <div className="flex items-center gap-1.5 text-sm">
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

      <span className="tabular-nums text-muted-foreground/70 text-xs min-w-[3rem] text-center">
        {position} / {nav.total}
      </span>

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

/** Context-aware back link — restores set browser filters from browse context */
export function SetBrowseBackLink() {
  const [href] = useState(() =>
    typeof window === "undefined"
      ? "/sets"
      : getBrowseReturnUrl("/sets", SET_BROWSE_KEY),
  );

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span aria-hidden="true">←</span>
      Back to Sets
    </Link>
  );
}
