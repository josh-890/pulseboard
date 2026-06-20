"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2, Star, Heart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteButton } from "@/components/shared/delete-button";
import {
  updateCollectionAction,
  deleteCollectionAction,
  setTargetCollectionAction,
  convertCollectionToFavoritesAction,
} from "@/lib/actions/collection-actions";
import { cn } from "@/lib/utils";
import type { CollectionLayout } from "@/lib/services/collection-service";
import { CollectionLayoutPicker } from "@/components/collections/collection-layout-picker";

type CollectionActionsProps = {
  collectionId: string;
  name: string;
  description: string | null;
  layout: CollectionLayout;
  isTarget?: boolean;
};

export function CollectionActions({
  collectionId,
  name: initialName,
  description: initialDescription,
  layout: initialLayout,
  isTarget = false,
}: CollectionActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [layout, setLayout] = useState<CollectionLayout>(initialLayout);
  const [saving, setSaving] = useState(false);
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

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const result = await updateCollectionAction(collectionId, {
      name: name.trim(),
      description: description.trim() || undefined,
      layout,
    });
    setSaving(false);

    if (result.success) {
      toast.success("Collection updated");
      setEditOpen(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to update");
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Collection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label htmlFor="edit-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="edit-desc" className="text-sm font-medium">
                Description
              </label>
              <Input
                id="edit-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <span className="text-sm font-medium">Layout</span>
              <CollectionLayoutPicker value={layout} onChange={setLayout} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!name.trim() || saving}
                onClick={handleSave}
              >
                {saving && <Loader2 size={14} className="animate-spin mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
