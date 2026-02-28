"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import { cn } from "@/lib/utils";

type HeadshotSlotSelectorProps = {
  slotLabels: ProfileImageLabel[];
};

export function HeadshotSlotSelector({ slotLabels }: HeadshotSlotSelectorProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeSlot = searchParams.get("slot");

  const handleSlotClick = useCallback(
    (slotNumber: number) => {
      const params = new URLSearchParams(searchParams.toString());
      const slotStr = String(slotNumber);

      if (activeSlot === slotStr) {
        params.delete("slot");
      } else {
        params.set("slot", slotStr);
      }

      // Reset loaded count when changing slot filter
      params.delete("loaded");

      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [searchParams, activeSlot, router, pathname],
  );

  return (
    <div className="flex items-center gap-1.5">
      {slotLabels.map((sl, i) => {
        const slotNumber = i + 1;
        const isActive = activeSlot === String(slotNumber);

        return (
          <button
            key={sl.slot}
            type="button"
            onClick={() => handleSlotClick(slotNumber)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "border-primary/30 bg-primary/15 text-primary shadow-sm"
                : "border-white/15 bg-card/50 text-muted-foreground hover:border-white/25 hover:bg-card/70 hover:text-foreground",
            )}
            aria-pressed={isActive}
            aria-label={`Filter by ${sl.label}`}
          >
            {sl.label}
          </button>
        );
      })}
    </div>
  );
}
