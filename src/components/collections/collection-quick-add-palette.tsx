"use client";

import { useState, useTransition } from "react";
import { Check, Star, Plus } from "lucide-react";
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
  createCollectionWithItemAction,
} from "@/lib/actions/collection-actions";
import { cn } from "@/lib/utils";

export type PaletteCollection = { id: string; name: string; isTarget?: boolean };

// ADR-0019: cmdk quick-add palette. Hotkey opens it; type to fuzzy-find a GRID
// collection; Enter toggles membership of the current image. The ★ marks the
// one-key target collection. Typing a new name offers an inline "Create" item that
// creates a global GRID collection and adds the current image to it.
export function CollectionQuickAddPalette({
  open,
  onOpenChange,
  mediaItemId,
  collectionIds,
  collections,
  onMembershipChange,
  onCollectionCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaItemId: string | null;
  collectionIds: string[];
  collections: PaletteCollection[];
  onMembershipChange?: (collectionId: string, isIn: boolean) => void;
  onCollectionCreated?: (collection: { id: string; name: string }) => void;
}) {
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");

  function handleOpenChange(next: boolean) {
    if (!next) setQuery("");
    onOpenChange(next);
  }

  function toggle(c: PaletteCollection) {
    if (!mediaItemId) return;
    const isIn = collectionIds.includes(c.id);
    onMembershipChange?.(c.id, !isIn);
    handleOpenChange(false);
    startTransition(async () => {
      const res = isIn
        ? await removeFromCollectionAction(c.id, [mediaItemId])
        : await addToCollectionAction(c.id, [mediaItemId]);
      if (!res.success) toast.error(res.error ?? "Failed");
      else toast.success(isIn ? `Removed from ${c.name}` : `Added to ${c.name}`);
    });
  }

  function createAndAdd() {
    const name = query.trim();
    if (!mediaItemId || !name) return;
    handleOpenChange(false);
    startTransition(async () => {
      const res = await createCollectionWithItemAction(name, mediaItemId);
      if (res.success && res.id) {
        onCollectionCreated?.({ id: res.id, name: res.name ?? name });
        toast.success(`Created “${res.name ?? name}” & added`);
      } else {
        toast.error(res.error ?? "Failed to create collection");
      }
    });
  }

  const trimmed = query.trim();
  const exactMatch = collections.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  const showCreate = trimmed.length > 0 && !exactMatch;

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} title="Add to collection">
      <CommandInput placeholder="Add to or create a collection…" value={query} onValueChange={setQuery} />
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
        {showCreate && (
          <CommandGroup heading="Create">
            <CommandItem key="__create__" value={`__create__ ${trimmed}`} forceMount onSelect={createAndAdd}>
              <Plus className="mr-2 h-4 w-4" />
              <span className="flex-1">
                Create “<span className="font-medium">{trimmed}</span>”
              </span>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
