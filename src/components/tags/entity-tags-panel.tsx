"use client";

import { useState } from "react";
import { useEntityTags } from "@/hooks/use-entity-tags";
import type { EffectiveTag } from "@/lib/effective-tags";
import type { TaggableEntity } from "@/lib/services/entity-tag-service";
import { EntityTagList } from "./entity-tag-list";
import { TagPalette } from "./tag-palette";

export type EntityTagsPanelProps = {
  entityType: TaggableEntity;
  entityId: string;
  /** Server-rendered effective tags (no loading flash) */
  initialTags?: EffectiveTag[];
};

// Self-contained tagging for a detail page: the effective tag list plus the
// palette behind its "+ Tag" button.
export function EntityTagsPanel({ entityType, entityId, initialTags }: EntityTagsPanelProps) {
  const controller = useEntityTags(entityType, entityId, initialTags);
  const [paletteOpen, setPaletteOpen] = useState(false);
  if (!controller) return null;

  return (
    <>
      <EntityTagList
        tags={controller.tags}
        isLoading={controller.isLoading}
        onRemove={controller.remove}
        onAdd={() => setPaletteOpen(true)}
      />
      <TagPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        entityType={entityType}
        selectedTagIds={controller.directTagIds}
        onToggle={controller.toggle}
      />
    </>
  );
}
