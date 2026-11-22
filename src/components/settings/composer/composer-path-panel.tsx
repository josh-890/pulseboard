"use client";

import type { ComposerPath } from "@/lib/composer";
import type { SimpleActionResult } from "@/lib/types";
import { updateComposerPathAction } from "@/lib/actions/composer-manage-actions";
import { ComposerTextField } from "./composer-text-field";
import { ComposerSegmented } from "./composer-segmented";
import { TILE_SHAPES } from "./composer-tile-shapes";
import { ComposerToggle } from "./composer-toggle";

export type ComposerPathPanelProps = {
  path: ComposerPath;
  call: (action: () => Promise<SimpleActionResult>) => Promise<void>;
  pending: boolean;
};

/** A path: its name, its tiles' shape, whether it is carried over, whether it describes a person */
export function ComposerPathPanel({ path, call, pending }: ComposerPathPanelProps) {
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
    </div>
  );
}
