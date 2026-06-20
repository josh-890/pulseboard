"use client";

import { useTransition } from "react";
import { Check, Star } from "lucide-react";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  addToCollectionAction,
  removeFromCollectionAction,
} from "@/lib/actions/collection-actions";
import { cn } from "@/lib/utils";

export type PaletteCollection = { id: string; name: string; isTarget?: boolean };

// ADR-0019: cmdk quick-add palette. Hotkey opens it; type to fuzzy-find a GRID
// collection; Enter toggles membership of the current image. The ★ marks the
// one-key target collection.
export function CollectionQuickAddPalette({
  open,
  onOpenChange,
  mediaItemId,
  collectionIds,
  collections,
  onMembershipChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaItemId: string | null;
  collectionIds: string[];
  collections: PaletteCollection[];
  onMembershipChange?: (collectionId: string, isIn: boolean) => void;
}) {
  const [, startTransition] = useTransition();

  function toggle(c: PaletteCollection) {
    if (!mediaItemId) return;
    const isIn = collectionIds.includes(c.id);
    onMembershipChange?.(c.id, !isIn);
    onOpenChange(false);
    startTransition(async () => {
      const res = isIn
        ? await removeFromCollectionAction(c.id, [mediaItemId])
        : await addToCollectionAction(c.id, [mediaItemId]);
      if (!res.success) toast.error(res.error ?? "Failed");
      else toast.success(isIn ? `Removed from ${c.name}` : `Added to ${c.name}`);
    });
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Add to collection">
      <CommandInput placeholder="Add to collection…" />
      <CommandList>
        <CommandEmpty>No collections found.</CommandEmpty>
        <CommandGroup>
          {collections.map((c) => {
            const isIn = collectionIds.includes(c.id);
            return (
              <CommandItem key={c.id} value={c.name} onSelect={() => toggle(c)}>
                <Check className={cn("mr-2 h-4 w-4", isIn ? "opacity-100" : "opacity-0")} />
                <span className="flex-1">{c.name}</span>
                {c.isTarget && (
                  <Star size={12} className="text-amber-400" fill="currentColor" />
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
