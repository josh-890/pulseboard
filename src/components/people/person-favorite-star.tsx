"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { setPersonFavoriteAction } from "@/lib/actions/person-actions";
import { cn } from "@/lib/utils";

// ADR-0019: toggle a Person as a favorite (★). Optimistic.
export function PersonFavoriteStar({
  personId,
  isFavorite: initial,
  size = 18,
}: {
  personId: string;
  isFavorite: boolean;
  size?: number;
}) {
  const [isFavorite, setIsFavorite] = useState(initial);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !isFavorite;
    setIsFavorite(next);
    startTransition(async () => {
      const res = await setPersonFavoriteAction(personId, next);
      if (!res.success) {
        setIsFavorite(!next);
        toast.error(res.error ?? "Failed");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isFavorite ? "Remove favorite person" : "Mark as favorite person"}
      title={isFavorite ? "Favorite person" : "Mark as favorite"}
      className={cn(
        "inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-white/10",
        isFavorite ? "text-amber-400" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Star size={size} fill={isFavorite ? "currentColor" : "none"} />
    </button>
  );
}
