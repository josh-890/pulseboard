"use client";

import { useState, useTransition } from "react";
import { Users, Eye, EyeOff, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { bulkSetShownPeopleAction } from "@/lib/actions/media-actions";
import type { GalleryCastMember } from "@/lib/types/gallery";

type BulkPeopleShownControlProps = {
  cast: GalleryCastMember[];
  selectedIds: string[];
  /** Called after a successful apply so the parent can update its local items (live badges). */
  onApplied: (personId: string, mode: "hide" | "show") => void;
};

/**
 * Bulk "people shown" control for the gallery selection bar (ADR-0023): pick a
 * person and Show / Hide them across all selected images (add/remove exclusions).
 */
export function BulkPeopleShownControl({ cast, selectedIds, onApplied }: BulkPeopleShownControlProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (cast.length === 0) return null;

  function apply(personId: string, mode: "hide" | "show") {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      await bulkSetShownPeopleAction(selectedIds, [personId], mode);
      onApplied(personId, mode);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={selectedIds.length === 0}>
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
          People shown
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        <p className="mb-1.5 px-1 text-[11px] text-muted-foreground">
          Apply to {selectedIds.length} selected image{selectedIds.length === 1 ? "" : "s"}
        </p>
        <ul className="space-y-0.5">
          {cast.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/40"
            >
              <span className="truncate">{c.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => apply(c.id, "show")}
                  className="rounded p-1 text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
                  title="Mark shown in the selected images"
                  aria-label={`Show ${c.name} in selected images`}
                >
                  <Eye size={14} />
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => apply(c.id, "hide")}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-40"
                  title="Mark not shown in the selected images"
                  aria-label={`Hide ${c.name} from selected images`}
                >
                  <EyeOff size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
