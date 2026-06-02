"use client";

import { useState, useTransition } from "react";
import { Star, StarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateSetRating } from "@/lib/actions/set-actions";

type SetRatingProps = {
  setId: string;
  initialRating: number | null;
};

// 5-star clickable widget mirroring the Person hero rating row. Same
// click-the-same-star-twice-to-clear behaviour. Optimistic local state +
// startTransition for the server write.
export function SetRating({ setId, initialRating }: SetRatingProps) {
  const [localRating, setLocalRating] = useState<number | null>(initialRating);
  const [, startTransition] = useTransition();

  const handleClick = (star: number) => {
    const newValue = star + 1;
    const value = newValue === localRating ? null : newValue;
    setLocalRating(value);
    startTransition(() => {
      updateSetRating(setId, value);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">
        RATING
      </span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          localRating ? "" : "text-muted-foreground/40",
        )}
      >
        {localRating ?? "—"}
      </span>
      <div
        className="flex items-center gap-0.5 cursor-pointer"
        role="slider"
        aria-label="Set rating"
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={localRating ?? undefined}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const filled =
            localRating !== null && localRating !== undefined && i < localRating;
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleClick(i)}
              className="transition-colors hover:scale-110"
              title={`Set rating to ${i + 1}`}
            >
              {filled ? (
                <Star size={16} className="fill-amber-400 text-amber-400" />
              ) : (
                <StarOff
                  size={16}
                  className="text-muted-foreground/30 hover:text-amber-400/50"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
