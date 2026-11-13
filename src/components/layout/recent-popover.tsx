"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { History } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EntityKindIcon, ENTITY_KIND } from "@/components/shared/entity-kind-icon";
import { formatRelativeTime } from "@/lib/utils";
import {
  RECENT_EVENT,
  clearRecent,
  parseRecent,
  readRecentRaw,
  recentHref,
  subscribeRecent,
} from "@/lib/recently-viewed";

/**
 * "Recent" in the top bar (2026-11-13): the last detail pages you opened,
 * newest first, the one you are on left out. Opening one starts a fresh track.
 */
export function RecentPopover() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const raw = useSyncExternalStore(subscribeRecent, readRecentRaw, () => null);
  const items = useMemo(() => parseRecent(raw).filter((i) => recentHref(i) !== pathname), [raw, pathname]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="recent-trigger"
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted/60 data-[state=open]:text-foreground"
        >
          <History size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Recent</span>
          <span className="sr-only sm:hidden">Recently viewed</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 border-white/20 bg-background p-0 shadow-xl" data-testid="recent-list">
        <div className="flex items-center justify-between border-b border-white/15 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground/60">Recently viewed</span>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearRecent();
                window.dispatchEvent(new Event(RECENT_EVENT));
              }}
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Clear
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Pages you open — people, sets, channels … — show up here.
          </p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto py-1">
            {items.map((i) => (
              <li key={`${i.type}:${i.id}`}>
                <Link
                  href={recentHref(i)}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <EntityKindIcon type={i.type} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{i.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {ENTITY_KIND[i.type].label} · {formatRelativeTime(new Date(i.at))}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
