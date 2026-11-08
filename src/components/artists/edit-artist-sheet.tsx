"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateArtistAction } from "@/lib/actions/artist-actions";

type EditArtistSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artist: {
    id: string;
    name: string;
    nationality: string | null;
    website: string | null;
  };
};

export function EditArtistSheet({ open, onOpenChange, artist }: EditArtistSheetProps) {
  const router = useRouter();
  const [name, setName] = useState(artist.name);
  const [nationality, setNationality] = useState(artist.nationality ?? "");
  const [website, setWebsite] = useState(artist.website ?? "");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    const result = await updateArtistAction({
      id: artist.id,
      name: name.trim(),
      nationality: nationality.trim() || undefined,
      // The bio is the page's About, edited there
      website: website.trim(),
    });

    if (result.success) {
      toast.success("Artist updated");
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(typeof result.error === "string" ? result.error : "Failed to update artist");
    }
    setIsSaving(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="border-b pb-4 px-4">
          <SheetTitle className="text-lg font-semibold">Edit Artist</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-artist-name">Name</Label>
            <Input
              id="edit-artist-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-artist-nationality">Nationality</Label>
            <Input
              id="edit-artist-nationality"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              placeholder="e.g. German"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-artist-website">Website</Label>
            <Input
              id="edit-artist-website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <SheetFooter className="mt-auto border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isSaving}>
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              Save Changes
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
