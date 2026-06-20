"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Star, Heart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/shared/delete-button";
import {
  deleteCollectionAction,
  setTargetCollectionAction,
  convertCollectionToFavoritesAction,
} from "@/lib/actions/collection-actions";
import { cn } from "@/lib/utils";
import type { CollectionLayout } from "@/lib/services/collection-service";
import { EditCollectionDialog } from "@/components/collections/edit-collection-dialog";

type CollectionActionsProps = {
  collectionId: string;
  name: string;
  description: string | null;
  layout: CollectionLayout;
  isTarget?: boolean;
};

export function CollectionActions({
  collectionId,
  name,
  description,
  layout,
  isTarget = false,
}: CollectionActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleToggleTarget() {
    setBusy(true);
    const result = await setTargetCollectionAction(isTarget ? null : collectionId);
    setBusy(false);
    if (result.success) {
      toast.success(isTarget ? "Cleared quick-add target" : "Set as quick-add target");
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed");
    }
  }

  async function handleConvertToFavorites() {
    setBusy(true);
    const result = await convertCollectionToFavoritesAction(collectionId);
    setBusy(false);
    if (result.success) {
      toast.success(`Marked ${result.count ?? 0} image(s) as favorite`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", isTarget && "text-amber-400")}
        disabled={busy}
        onClick={handleToggleTarget}
        title={isTarget ? "Clear quick-add target" : "Set as quick-add target (one-key add destination)"}
      >
        <Star size={14} fill={isTarget ? "currentColor" : "none"} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={busy}
        onClick={handleConvertToFavorites}
        title="Mark all images in this collection as favorites"
      >
        <Heart size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setEditOpen(true)}
        title="Edit collection"
      >
        <Pencil size={14} />
      </Button>
      <DeleteButton
        title="Delete collection?"
        description="This will permanently remove the collection. Media items will not be deleted."
        onDelete={deleteCollectionAction.bind(null, collectionId)}
        redirectTo="/collections"
      />

      <EditCollectionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        collectionId={collectionId}
        name={name}
        description={description}
        layout={layout}
      />
    </div>
  );
}
