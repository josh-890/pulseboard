"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createArtistAction } from "@/lib/actions/artist-actions";

type CreateArtistSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (artist: { id: string; name: string }) => void;
};

export function CreateArtistSheet({ open, onOpenChange, onCreated }: CreateArtistSheetProps) {
  const [name, setName] = useState("");
  const [nationality, setNationality] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    const result = await createArtistAction({
      name: name.trim(),
      nationality: nationality.trim() || undefined,
    });

    if (result.success) {
      toast.success("Artist created");
      onCreated({ id: result.id, name: name.trim() });
      setName("");
      setNationality("");
      onOpenChange(false);
    } else {
      toast.error(typeof result.error === "string" ? result.error : "Failed to create artist");
    }
    setIsSaving(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="border-b pb-4 px-4">
          <SheetTitle className="text-lg font-semibold">Create Artist</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Add a new photographer or artist.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="artist-name">Name</Label>
            <Input
              id="artist-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Stefan Soell"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="artist-nationality">Nationality</Label>
            <Input
              id="artist-nationality"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              placeholder="e.g. German"
            />
          </div>

          <SheetFooter className="mt-auto border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isSaving}>
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              Create Artist
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
