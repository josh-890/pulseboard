"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditArtistSheet } from "./edit-artist-sheet";
import { EntityMark } from "@/components/shared/entity-mark";
import { BrandMarkEditor } from "@/components/shared/brand-mark-editor";
import type { EntityBrand } from "@/lib/brand-mark";

type ArtistDetailHeaderProps = {
  artist: {
    id: string;
    name: string;
    nationality: string | null;
    bio: string | null;
  };
  brand: EntityBrand;
};

export function ArtistDetailHeader({ artist, brand }: ArtistDetailHeaderProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <EntityMark brand={brand} variant="tile" size="xl" round />
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

        <div className="flex shrink-0 items-center gap-1.5">
          <BrandMarkEditor kind="artist" id={artist.id} brand={brand} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Edit artist"
            onClick={() => setEditOpen(true)}
          >
            <Pencil size={14} />
          </Button>
        </div>
      </div>

      <EditArtistSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        artist={artist}
      />
    </div>
  );
}
