"use client";

import type { ComposerPath } from "@/lib/composer";
import type { SimpleActionResult } from "@/lib/types";
import { toast } from "sonner";
import { createComposerSectionAction, updateComposerPathAction } from "@/lib/actions/composer-manage-actions";
import { ComposerAddForm } from "./composer-add-form";
import { ComposerTextField } from "./composer-text-field";
import { ComposerSegmented } from "./composer-segmented";
import { TILE_SHAPES } from "./composer-tile-shapes";
import { ComposerToggle } from "./composer-toggle";

export type ComposerPathPanelProps = {
  path: ComposerPath;
  call: (action: () => Promise<SimpleActionResult>) => Promise<void>;
  pending: boolean;
  /** A section was added — select it once the tree holds it */
  onSectionAdded: (sectionId: string) => void;
};

/** A path: its name, its tiles' shape, whether it is carried over, whether it describes a person */
export function ComposerPathPanel({ path, call, pending, onSectionAdded }: ComposerPathPanelProps) {
  const save = (data: Parameters<typeof updateComposerPathAction>[1]) => call(() => updateComposerPathAction(path.id, data));
  return (
    <div className="space-y-4" data-testid="composer-panel-path">
      <ComposerTextField label="Name" value={path.name} required onSave={(name) => save({ name })} testId="composer-path-name" />
      <ComposerSegmented
        label="Tile shape (examples of its facets, unless a facet sets its own)"
        value={path.tileAspect}
        options={TILE_SHAPES.map((s) => ({ value: s, label: s }))}
        onChange={(tileAspect) => void save({ tileAspect }).catch(() => {})}
        disabled={pending}
      />
      <ComposerToggle
        label="Carried over"
        hint="Pinned by default: what was written here is offered on the next photo."
        checked={path.pinned}
        disabled={pending}
        onChange={(pinned) => void save({ pinned }).catch(() => {})}
      />
      <ComposerToggle
        label="Describes a person"
        hint="On a photo with two or more people its values are picked per person and written attributed to her."
        checked={!!path.personal}
        disabled={pending}
        onChange={(personal) => void save({ personal }).catch(() => {})}
        testId="composer-path-personal"
      />
      <ComposerAddForm
        label="Add a section"
        placeholder="e.g. Named expressions"
        hint="It joins the end of the path; add its facets there."
        testId="composer-add-section"
        onAdd={async (name) => {
          const r = await createComposerSectionAction(path.id, name);
          if (!r.success || !r.id) {
            toast.error(r.error ?? "Could not add the section");
            return false;
          }
          onSectionAdded(r.id);
          return true;
        }}
      />
    </div>
  );
}
