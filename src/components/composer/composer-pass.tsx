"use client";

import { cn } from "@/lib/utils";
import type { ComposerCatalog, ComposerSection } from "@/lib/composer";
import { ComposerTile, wantsVisualTiles } from "./composer-tile";
import { pathStyle } from "./composer-path-style";

export type ComposerPassProps = {
  catalog: ComposerCatalog;
  /** The passable sections, with the name of the path each sits in */
  sections: { section: ComposerSection; pathName: string }[];
  sectionId: string;
  onSection: (sectionId: string) => void;
  /** The section's tags in key order (1–9) */
  tagIds: string[];
  /** The current photo's own tags */
  own: string[];
  onChoose: (tagId: string) => void;
  tileAspect?: string;
};

/**
 * Pass mode (ADR-0042, Prodigy's one decision at a time): one section, the
 * photos one after the other; a key 1–9 writes that tag (replacing the photo's
 * other tag in the section) and moves on. 0 clears, → skips, Esc ends.
 */
export function ComposerPass({ catalog, sections, sectionId, onSection, tagIds, own, onChoose, tileAspect }: ComposerPassProps) {
  const visual = wantsVisualTiles(tagIds.map((id) => catalog.tags[id]));
  const current = sections.find((s) => s.section.id === sectionId);
  const style = pathStyle(current?.pathName ?? "");
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="composer-pass">
      <div className="flex flex-wrap gap-1 border-b border-border/60 p-2" role="radiogroup" aria-label="Section to pass through">
        {sections.map(({ section, pathName }) => {
          const s = pathStyle(pathName);
          const active = section.id === sectionId;
          return (
            <button
              key={section.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSection(section.id)}
              data-testid={`composer-pass-section-${section.name}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? cn(s.on, s.text) : "border-border/50 text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden />
              {section.name}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-xs text-muted-foreground">
          Press a key to write it on this photo and move on. <kbd className="font-medium">0</kbd> clears the section,{" "}
          <kbd className="font-medium">→</kbd> skips, <kbd className="font-medium">Esc</kbd> ends the pass.
        </p>
        <div className={cn("grid gap-1.5", visual ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
          {tagIds.map((id, i) => (
            <ComposerTile
              key={id}
              tag={catalog.tags[id]}
              state={own.includes(id) ? "on" : "off"}
              style={style}
              onToggle={() => onChoose(id)}
              shortcut={i < 9 ? String(i + 1) : undefined}
              visual={visual}
              tileAspect={tileAspect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
