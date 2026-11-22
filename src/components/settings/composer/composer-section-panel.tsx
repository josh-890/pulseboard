"use client";

import type { ComposerSection } from "@/lib/composer";
import type { SimpleActionResult } from "@/lib/types";
import { updateComposerSectionAction } from "@/lib/actions/composer-manage-actions";
import { ComposerTextField } from "./composer-text-field";
import { ComposerToggle } from "./composer-toggle";

export type ComposerSectionPanelProps = {
  section: ComposerSection;
  /** The section drawn as the shot row above the tabs */
  isLead: boolean;
  call: (action: () => Promise<SimpleActionResult>) => Promise<void>;
  pending: boolean;
};

const KIND_TEXT = {
  TILES: "Tiles of its facets.",
  MATRIX: "The state matrix: a state × garment grid for the garments on the photo.",
  REFINEMENT: "A retired refinement section (ADR-0043) — its values now live in facets.",
} as const;

/** A section: its name and whether pass mode offers it */
export function ComposerSectionPanel({ section, isLead, call, pending }: ComposerSectionPanelProps) {
  const save = (data: Parameters<typeof updateComposerSectionAction>[1]) => call(() => updateComposerSectionAction(section.id, data));
  return (
    <div className="space-y-4" data-testid="composer-panel-section">
      <ComposerTextField label="Name" value={section.name} required onSave={(name) => save({ name })} />
      {isLead && (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          Named “Shot”: drawn as the row above the tabs, answered first. Renaming it makes it an ordinary section.
        </p>
      )}
      <p className="text-xs text-muted-foreground">{KIND_TEXT[section.kind]}</p>
      <ComposerToggle
        label="Offered in pass mode"
        hint="One section, photo by photo, keys 1–9."
        checked={section.passable}
        disabled={pending}
        onChange={(passable) => void save({ passable }).catch(() => {})}
      />
    </div>
  );
}
