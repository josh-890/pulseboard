"use client";

import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TRAIL_STORAGE_KEY,
  parseTrailStore,
  setPendingScroll,
  siblingHref,
  trailChain,
  trailNav,
  type TrailEntityType,
} from "@/lib/browse-trail";

type TrailHeaderRowProps = {
  entityType: TrailEntityType;
  entityId: string;
  /** Today's back link (gallery), used when the page was not opened from a list */
  fallbackBack: ReactNode;
  /** Today's gallery prev/next, used likewise */
  fallbackNav?: ReactNode;
  /** The page's own buttons, on the right */
  actions?: ReactNode;
};

const SSR = "\u0000ssr";

function subscribe(onChange: () => void) {
  const handler = (e: StorageEvent) => {
    if (e.key === TRAIL_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function snapshot(): string | null {
  try {
    return window.localStorage.getItem(TRAIL_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The top row of a detail page (2026-11-13): back link · prev/next · actions,
 * plus a crumb row when the track has more than one level. Opened from a list
 * (`?via=`), it walks that list; otherwise it shows the gallery fallbacks as
 * before.
 */
export function TrailHeaderRow({ entityType, entityId, fallbackBack, fallbackNav, actions }: TrailHeaderRowProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const via = sp.get("via");
  const tab = sp.get("tab");
  const raw = useSyncExternalStore(subscribe, snapshot, () => SSR);
  const hydrating = raw === SSR;
  const store = useMemo(() => (hydrating ? {} : parseTrailStore(raw)), [raw, hydrating]);
  const active = useMemo(() => {
    const entry = via ? store[via] : undefined;
    const nav = entry && entry.entityType === entityType ? trailNav(entry, entityId) : null;
    return entry && nav ? { entry, nav } : null;
  }, [store, via, entityType, entityId]);
  const chain = useMemo(() => (active && via ? trailChain(via, store) : []), [active, via, store]);

  // ← → walk the list, Esc goes back to it — as the gallery bars do.
  useEffect(() => {
    if (!active || !via) return;
    const { entry: e, nav: n } = active;
    function onKey(ev: KeyboardEvent) {
      const el = ev.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return;
      if (document.querySelector("[role='dialog']") || document.querySelector("[data-lightbox-open]")) return;
      if (ev.key === "ArrowLeft" && n.prevId) {
        ev.preventDefault();
        router.push(siblingHref(entityType, n.prevId, via!, tab));
      } else if (ev.key === "ArrowRight" && n.nextId) {
        ev.preventDefault();
        router.push(siblingHref(entityType, n.nextId, via!, tab));
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        setPendingScroll(e.returnHref, e.scrollY);
        router.push(e.returnHref);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, via, tab, entityType, router]);

  let back: ReactNode;
  let middle: ReactNode;
  if (via && hydrating) {
    back = <span className="h-5" aria-hidden="true" />;
    middle = null;
  } else if (active && via) {
    const { entry: e, nav: n } = active;
    back = (
      <Link
        href={e.returnHref}
        onClick={() => setPendingScroll(e.returnHref, e.scrollY)}
        title={`Back to ${e.title} (Esc)`}
        data-testid="trail-back"
        className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span aria-hidden="true">←</span>
        <span className="truncate">Back to {e.title}</span>
      </Link>
    );
    middle = (
      <div className="flex items-center gap-1.5 text-sm" data-testid="trail-nav">
        <StepLink href={n.prevId ? siblingHref(entityType, n.prevId, via, tab) : null} name={n.prevName} dir="prev" />
        <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground/70" title={e.title}>
          {n.index + 1} / {n.total}
        </span>
        <StepLink href={n.nextId ? siblingHref(entityType, n.nextId, via, tab) : null} name={n.nextName} dir="next" />
      </div>
    );
  } else {
    back = fallbackBack;
    middle = fallbackNav ?? null;
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 items-center gap-4">
        <div className="flex min-w-0 items-center">{back}</div>
        <div className="flex justify-center">{middle}</div>
        <div className="flex items-center justify-end gap-2">{actions}</div>
      </div>
      {chain.length > 1 && (
        <nav aria-label="Trail" data-testid="trail-crumbs">
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            {chain.map((c, i) => (
              <li key={c.id} className="inline-flex min-w-0 items-center gap-1.5">
                {i > 0 && <ChevronRight size={12} aria-hidden="true" className="shrink-0 text-muted-foreground/50" />}
                <Link
                  href={c.returnHref}
                  onClick={() => setPendingScroll(c.returnHref, c.scrollY)}
                  className={cn(
                    "max-w-[16rem] truncate rounded px-1 py-0.5 transition-colors hover:bg-muted/60 hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    i === chain.length - 1 && "font-medium text-foreground/80",
                  )}
                >
                  {c.title}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  );
}

function StepLink({ href, name, dir }: { href: string | null; name: string | null; dir: "prev" | "next" }) {
  const icon = dir === "prev" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />;
  if (!href) {
    return (
      <span className="inline-flex cursor-default items-center rounded-md px-1.5 py-1 text-muted-foreground/40" aria-hidden="true">
        {icon}
      </span>
    );
  }
  const label = `${dir === "prev" ? "Previous" : "Next"}: ${name ?? ""}`;
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {dir === "prev" && icon}
      <span className="hidden max-w-[100px] truncate sm:inline">{name}</span>
      {dir === "next" && icon}
    </Link>
  );
}
