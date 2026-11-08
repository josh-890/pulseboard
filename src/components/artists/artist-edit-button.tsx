"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditArtistSheet } from "./edit-artist-sheet";

type ArtistEditButtonProps = {
  artist: { id: string; name: string; nationality: string | null; website: string | null };
};

/** Edit: name, nationality, website (the bio is the page's About) */
export function ArtistEditButton({ artist }: ArtistEditButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Pencil size={14} /> Edit
      </Button>
      <EditArtistSheet open={open} onOpenChange={setOpen} artist={artist} />
    </>
  );
}
