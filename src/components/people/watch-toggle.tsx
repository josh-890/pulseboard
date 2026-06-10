"use client";

import { useState, useTransition } from "react";
import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { togglePersonWatch } from "@/lib/actions/person-actions";

export type WatchToggleProps = {
  personId: string;
  watching: boolean;
  /** `icon` = compact icon-only (detail header); `button` = labelled pill. */
  variant?: "icon" | "button";
};

// Affordance to put a person on / off the watchlist (monitor for new sets).
// Optimistic; reverts on failure.
export function WatchToggle({
  personId,
  watching: initial,
  variant = "button",
}: WatchToggleProps) {
  const [watching, setWatching] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    const next = !watching;
    setWatching(next);
    startTransition(async () => {
      const res = await togglePersonWatch(personId, next);
      if (!res.success) {
        setWatching(!next);
        toast.error(res.error ?? "Failed to update watchlist");
        return;
      }
      toast.success(next ? "Added to watchlist" : "Removed from watchlist");
      router.refresh();
    });
  }

  const title = watching
    ? "On watchlist — click to stop watching"
    : "Add to watchlist";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={watching}
        aria-label={title}
        title={title}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
          watching
            ? "border-primary/50 bg-primary/15 text-primary"
            : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          pending && "opacity-60",
        )}
      >
        <Eye size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={watching}
      title={title}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors",
        watching
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-border/50 bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
        pending && "opacity-60",
      )}
    >
      <Eye size={16} />
      {watching ? "Watching" : "Watch"}
    </button>
  );
}
