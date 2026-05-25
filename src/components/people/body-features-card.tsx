"use client";

import { useRef, useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/people/person-detail-helpers";
import { AddBodyFeaturePopover, type BodyFeatureChoice } from "@/components/people/add-body-feature-popover";
import { getRegionLabel } from "@/lib/constants/body-regions";

// Phase G Slice 11 / project_identity_bearing_ui: unified card replacing
// the separate Body Marks + Body Modifications cards.
//
// Subsection structure (per memory):
//  - One outer card "Body Features", total count badge.
//  - Subsection per category with ≥1 entry: small label + accent dot + count.
//  - Empty subsections are hidden entirely (populated-only rule).
//  - Footer "+ Add body feature" opens a type picker popover; parent handles
//    the actual sheet routing via onAddSelect.
//
// Rows themselves are passed in as ReactNode arrays so the parent retains
// per-row handler wiring (which differs in shape per entity type).

type Props = {
  markCount: number;
  modCount: number;
  markRows: React.ReactNode;
  modRows: React.ReactNode;
  onAddSelect: (choice: BodyFeatureChoice) => void;
  // Phase G Slice 13: region filter chip. Driven by clicks on the body
  // map. When non-null, the parent has already filtered markRows/modRows
  // to the matching subset; this card just surfaces the chip with × to
  // clear.
  selectedRegion?: string | null;
  onClearSelectedRegion?: () => void;
};

export function BodyFeaturesCard({ markCount, modCount, markRows, modRows, onAddSelect, selectedRegion, onClearSelectedRegion }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const total = markCount + modCount;

  const addButton = (
    <div className="relative">
      <button
        ref={addBtnRef}
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md border border-white/15 bg-muted/30 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50"
      >
        <Plus size={12} /> Add body feature
      </button>
      {pickerOpen && (
        <AddBodyFeaturePopover
          anchorRef={addBtnRef}
          onSelect={onAddSelect}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );

  return (
    <SectionCard
      title="Body Features"
      icon={<Sparkles size={18} />}
      badge={total}
      accent="indigo"
      action={addButton}
    >
      {selectedRegion && onClearSelectedRegion && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-xs text-indigo-700 dark:text-indigo-300">
          <span className="font-medium">Region:</span>
          <span>{getRegionLabel(selectedRegion)}</span>
          <button
            type="button"
            onClick={onClearSelectedRegion}
            className="ml-0.5 -mr-0.5 rounded-full p-0.5 hover:bg-indigo-500/20 transition-colors"
            aria-label="Clear region filter"
          >
            <X size={11} />
          </button>
        </div>
      )}
      {total === 0 ? (
        <EmptyState message="No body features recorded yet." />
      ) : (
        <div className="space-y-5">
          {markCount > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500/70" aria-hidden="true" />
                Body Marks
                <span className="text-muted-foreground/50">{markCount}</span>
              </div>
              <div className="space-y-2">{markRows}</div>
            </section>
          )}
          {modCount > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-teal-500/70" aria-hidden="true" />
                Body Modifications
                <span className="text-muted-foreground/50">{modCount}</span>
              </div>
              <div className="space-y-2">{modRows}</div>
            </section>
          )}
        </div>
      )}
    </SectionCard>
  );
}
