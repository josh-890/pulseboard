"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect } from "react";
import type { ProfileFramingOption } from "@/lib/services/category-service";
import { cn } from "@/lib/utils";

type ProfileViewSelectorProps = {
  framings: ProfileFramingOption[];
};

/**
 * People-browser display-framing selector (ADR-0016). Picks which Profile-category
 * representative the person cards show. The avatar-source (Headshot) is the default
 * — selecting it clears the `slot` param; the others set `?slot={N}`. Number keys
 * 1..N mirror the chip order as hotkeys.
 */
export function ProfileViewSelector({ framings }: ProfileViewSelectorProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeSlot = searchParams.get("slot");

  const select = useCallback(
    (framing: ProfileFramingOption) => {
      // Read the LIVE URL, not useSearchParams: infinite-scroll updates `loaded`
      // via history.replaceState, and we must preserve it. A framing swap is a
      // view toggle (which photo the cards show), NOT a filter — so the loaded
      // window and scroll position must stay put; only the slot param changes.
      const params = new URLSearchParams(window.location.search);
      // The default (Headshot) framing carries no param to keep URLs clean.
      if (framing.isAvatarSource) {
        params.delete("slot");
      } else {
        params.set("slot", String(framing.slot));
      }
      const qs = params.toString();
      // scroll:false keeps the current scroll position (App Router otherwise
      // jumps to the top on navigation).
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  // Number-key hotkeys: digit d → the d-th framing chip (1-indexed).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const d = parseInt(e.key, 10);
      if (Number.isNaN(d) || d < 1 || d > framings.length) return;
      e.preventDefault();
      select(framings[d - 1]);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [framings, select]);

  if (framings.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Card photo framing">
      {framings.map((f, i) => {
        const isActive = f.isAvatarSource ? activeSlot === null : activeSlot === String(f.slot);
        return (
          <button
            key={f.slot}
            type="button"
            onClick={() => select(f)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "border-primary/30 bg-primary/15 text-primary shadow-sm"
                : "border-white/15 bg-card/50 text-muted-foreground hover:border-white/25 hover:bg-card/70 hover:text-foreground",
            )}
            aria-pressed={isActive}
            aria-keyshortcuts={String(i + 1)}
            title={`Show ${f.name} (press ${i + 1})`}
          >
            {f.name}
          </button>
        );
      })}
    </div>
  );
}
