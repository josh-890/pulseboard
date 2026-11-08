"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { SimpleActionResult } from "@/lib/types";

type StarRatingProps = {
  initialRating: number | null;
  /** Saves the new value (null clears) — a server action bound to its entity */
  onRate: (rating: number | null) => Promise<SimpleActionResult>;
  /** What is rated, for screen readers: "channel" → "Rate this channel 3 of 5" */
  noun: string;
  size?: number;
  className?: string;
};

/**
 * Five clickable stars, as on the person and set heroes: clicking the current
 * value clears it. Optimistic, rolled back with a toast when the save fails.
 */
export function StarRating({ initialRating, onRate, noun, size = 18, className }: StarRatingProps) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [isPending, start] = useTransition();

  function rate(star: number) {
    const previous = rating;
    const next = star === rating ? null : star;
    setRating(next);
    start(async () => {
      const res = await onRate(next);
      if (!res.success) {
        setRating(previous);
        toast.error(res.error ?? "Could not save the rating");
      }
    });
  }

  return (
    <div className={cn("flex items-center", isPending && "opacity-70", className)} role="group" aria-label={`Your rating of this ${noun}`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = rating !== null && star <= rating;
        return (
          <button
            key={star}
            type="button"
            onClick={() => rate(star)}
            aria-pressed={filled}
            aria-label={star === rating ? `Clear rating (${star} of 5)` : `Rate this ${noun} ${star} of 5`}
            title={star === rating ? "Click again to clear" : `${star} of 5`}
            className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Star
              size={size}
              className={cn(filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/35 hover:text-amber-400/60")}
            />
          </button>
        );
      })}
    </div>
  );
}
