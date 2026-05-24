"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { useEscToClose } from "@/lib/hooks/use-esc-to-close";
import { cn } from "@/lib/utils";
import type { PhysicalAttributeGroupWithDefinitions } from "@/lib/services/physical-attribute-catalog-service";

type AddAttributePickerProps = {
  attributeGroups: PhysicalAttributeGroupWithDefinitions[];
  // Slug or definition-id set of attributes that the person already has a
  // value for — rendered muted ("already tracked").
  populatedDefinitionIds: Set<string>;
  onClose: () => void;
  onSelect: (definitionId: string) => void;
};

// Cross-group catalog picker (Phase G Slice 2). Lets the user discover and
// open the record-change flow for an attribute they don't yet track, without
// hunting through the giant Record Change sheet's grouped expandables.
//
// State of pre-selection inside the record sheet: the existing sheet doesn't
// pre-scroll to a specific attribute (Slice 7 redesigns the sheet). For now,
// `onSelect` just opens the sheet — the user fills the relevant field there.
export function AddAttributePicker({
  attributeGroups,
  populatedDefinitionIds,
  onClose,
  onSelect,
}: AddAttributePickerProps) {
  useEscToClose(onClose);
  const [query, setQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    // If a search is active later, all groups will expand; default is all
    // collapsed for the unsearched browse case.
    () => new Set(),
  );

  const q = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!q) return attributeGroups;
    return attributeGroups
      .map((g) => ({
        ...g,
        definitions: g.definitions.filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            d.slug.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.definitions.length > 0);
  }, [attributeGroups, q]);

  // When the user types a query, auto-expand any group with matches so the
  // search results are visible without an extra click.
  const effectivelyExpanded = useMemo(() => {
    if (!q) return expandedGroups;
    return new Set(filteredGroups.map((g) => g.id));
  }, [q, filteredGroups, expandedGroups]);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">Track another attribute</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close picker"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <p className="text-sm text-muted-foreground">
            Search or browse the catalog. Already-tracked attributes are muted —
            pick one to record a change. Pick a new attribute to start tracking it.
          </p>

          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find or add: hair texture, freckles…"
              className="w-full rounded-lg border border-white/15 bg-muted/30 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>

          {/* Grouped list */}
          {filteredGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground/70 italic">
              No catalog attributes match.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredGroups.map((group) => {
                const isExpanded = effectivelyExpanded.has(group.id);
                return (
                  <div
                    key={group.id}
                    className="rounded-lg border border-white/10 bg-muted/20"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.id)) next.delete(group.id);
                          else next.add(group.id);
                          return next;
                        })
                      }
                      className="flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight
                        size={14}
                        className={cn(
                          "transition-transform",
                          isExpanded && "rotate-90",
                        )}
                      />
                      {group.name}
                      <span className="text-xs font-normal text-muted-foreground/50">
                        {group.definitions.length}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-white/5 px-2 pb-2 pt-1 space-y-0.5">
                        {group.definitions.map((def) => {
                          const isPopulated = populatedDefinitionIds.has(def.id);
                          return (
                            <button
                              key={def.id}
                              type="button"
                              onClick={() => onSelect(def.id)}
                              className={cn(
                                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-left transition-colors hover:bg-muted/40",
                                isPopulated && "text-muted-foreground/60",
                              )}
                              title={isPopulated ? "Already tracked — record a change" : "Start tracking this attribute"}
                            >
                              <span className="truncate">{def.name}</span>
                              <span
                                className={cn(
                                  "ml-2 shrink-0 text-[10px] uppercase tracking-wider",
                                  isPopulated
                                    ? "text-muted-foreground/60"
                                    : "text-primary/80",
                                )}
                              >
                                {isPopulated ? "tracked" : "+ track"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
