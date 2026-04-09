"use client";

import { useState } from "react";
import { Palette, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditArtistSheet } from "./edit-artist-sheet";

type ArtistDetailHeaderProps = {
  artist: {
    id: string;
    name: string;
    nationality: string | null;
    bio: string | null;
  };
};

export function ArtistDetailHeader({ artist }: ArtistDetailHeaderProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
            <Palette size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">{artist.name}</h1>
            {artist.nationality && (
              <p className="mt-0.5 text-sm text-muted-foreground">{artist.nationality}</p>
            )}
            {artist.bio && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {artist.bio}
              </p>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setEditOpen(true)}
        >
          <Pencil size={14} />
        </Button>
      </div>

      <EditArtistSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        artist={artist}
      />
    </div>
  );
}
