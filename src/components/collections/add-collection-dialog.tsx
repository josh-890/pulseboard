"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { createCollectionAction } from "@/lib/actions/collection-actions";

export function AddCollectionDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    const result = await createCollectionAction(null, name.trim(), description.trim() || undefined);
    setSaving(false);

    if (result.success) {
      toast.success("Collection created");
      setOpen(false);
      setName("");
      setDescription("");
      if (result.id) {
        router.push(`/collections/${result.id}`);
      } else {
        router.refresh();
      }
    } else {
      toast.error(result.error ?? "Failed to create collection");
    }
  }

  return (
    <>
      <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
        <Plus size={14} />
        New Collection
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Collection</DialogTitle>
            <DialogDescription>
              Create a global collection to curate media across sessions and people.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label htmlFor="coll-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="coll-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Portfolio Candidates"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="coll-desc" className="text-sm font-medium">
                Description
              </label>
              <Input
                id="coll-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!name.trim() || saving}
                onClick={handleCreate}
              >
                {saving && <Loader2 size={14} className="animate-spin mr-1" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
