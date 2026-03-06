"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2 } from "lucide-react";
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
} from "@/lib/actions/collection-actions";

type CollectionActionsProps = {
  collectionId: string;
  name: string;
  description: string | null;
};

export function CollectionActions({
  collectionId,
  name: initialName,
  description: initialDescription,
}: CollectionActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const result = await updateCollectionAction(collectionId, {
      name: name.trim(),
      description: description.trim() || undefined,
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
