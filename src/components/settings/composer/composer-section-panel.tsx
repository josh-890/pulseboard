"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ComposerSection, FacetChoice } from "@/lib/composer";
import type { SimpleActionResult } from "@/lib/types";
import { createComposerFacetAction, deleteComposerSectionAction, updateComposerSectionAction } from "@/lib/actions/composer-manage-actions";
import { ComposerAddForm } from "./composer-add-form";
import { ComposerSegmented } from "./composer-segmented";
import { ComposerTextField } from "./composer-text-field";
import { ComposerToggle } from "./composer-toggle";

export type ComposerSectionPanelProps = {
  section: ComposerSection;
  pathId: string;
  /** The section drawn as the shot row above the tabs */
  isLead: boolean;
  call: (action: () => Promise<SimpleActionResult>) => Promise<void>;
  pending: boolean;
  /** A facet was added — select it once the tree holds it */
  onFacetAdded: (groupId: string, sectionId: string) => void;
  /** The section was removed — select its path */
  onDeleted: (pathId: string) => void;
};

const KIND_TEXT = {
  TILES: "Tiles of its facets.",
  MATRIX: "The state matrix: a state × garment grid for the garments on the photo.",
  REFINEMENT: "A retired refinement section (ADR-0043) — its values now live in facets.",
} as const;

/** A section: its name, whether pass mode offers it, and its facets (add one; remove the section once empty) */
export function ComposerSectionPanel({ section, pathId, isLead, call, pending, onFacetAdded, onDeleted }: ComposerSectionPanelProps) {
  const [choice, setChoice] = useState<FacetChoice>("MANY");
  const save = (data: Parameters<typeof updateComposerSectionAction>[1]) => call(() => updateComposerSectionAction(section.id, data));
  const empty = section.groupIds.length === 0;

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

      {section.kind !== "MATRIX" && (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <ComposerSegmented<FacetChoice>
            label="New facet answers"
            value={choice}
            options={[
              { value: "ONE", label: "One", hint: "A pick replaces the facet's other value" },
              { value: "MANY", label: "Many", hint: "Values are toggled one by one" },
            ]}
            onChange={setChoice}
          />
          <ComposerAddForm
            label="Add a facet"
            placeholder="e.g. Named expressions"
            hint="A new tag group, set up like this path's other facets. A tag group of that name not yet in the Composer is taken in instead."
            testId="composer-add-facet"
            onAdd={async (name) => {
              const r = await createComposerFacetAction(section.id, name, choice);
              if (!r.success || !r.id) {
                toast.error(r.error ?? "Could not add the facet");
                return false;
              }
              onFacetAdded(r.id, section.id);
              return true;
            }}
          />
        </div>
      )}

      {empty && (
        <button
          type="button"
          disabled={pending}
          data-testid="composer-delete-section"
          onClick={() =>
            void call(() => deleteComposerSectionAction(section.id))
              .then(() => onDeleted(pathId))
              .catch(() => {})
          }
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Trash2 size={13} aria-hidden /> Remove this empty section
        </button>
      )}
    </div>
  );
}
