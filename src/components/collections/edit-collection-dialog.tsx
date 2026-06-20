"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateCollectionAction } from "@/lib/actions/collection-actions";
import type { CollectionLayout } from "@/lib/services/collection-service";
import { CollectionLayoutPicker } from "@/components/collections/collection-layout-picker";

// Controlled edit dialog, reused by CollectionActions (detail) + CollectionCard (landing).
export function EditCollectionDialog({
  open,
  onOpenChange,
  collectionId,
  name: initialName,
  description: initialDescription,
  layout: initialLayout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  name: string;
  description: string | null;
  layout: CollectionLayout;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [layout, setLayout] = useState<CollectionLayout>(initialLayout);
  const [saving, setSaving] = useState(false);

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
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to update");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Collection</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label htmlFor="edit-name" className="text-sm font-medium">
              Name
            </label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label htmlFor="edit-desc" className="text-sm font-medium">
              Description
            </label>
            <Input id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <span className="text-sm font-medium">Layout</span>
            <CollectionLayoutPicker value={layout} onChange={setLayout} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!name.trim() || saving} onClick={handleSave}>
              {saving && <Loader2 size={14} className="mr-1 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
