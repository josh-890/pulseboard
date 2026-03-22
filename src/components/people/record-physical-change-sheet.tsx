"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { recordPhysicalChangeAction } from "@/lib/actions/appearance-actions";
import type { PhysicalAttributeGroupWithDefinitions } from "@/lib/services/physical-attribute-catalog-service";
import type { PersonCurrentState } from "@/lib/types";
import { SelectWithOther } from "@/components/shared/select-with-other";
import { CURRENT_HAIR_COLOR_OPTIONS, BUILD_OPTIONS } from "@/lib/constants/appearance";

type RecordPhysicalChangeSheetProps = {
  personId: string;
  currentState?: PersonCurrentState;
  attributeGroups?: PhysicalAttributeGroupWithDefinitions[];
  onClose: () => void;
};

export function RecordPhysicalChangeSheet({ personId, currentState, attributeGroups, onClose }: RecordPhysicalChangeSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [datePrecision, setDatePrecision] = useState("UNKNOWN");

  // Pre-fill with current state values
  const initialHairColor = currentState?.currentHairColor ?? "";
  const initialWeight = currentState?.weight != null ? String(currentState.weight) : "";
  const initialBuild = currentState?.build ?? "";
  const extensibleAttributes = currentState?.extensibleAttributes;
  const initialAttrValues = useMemo(() => {
    if (!extensibleAttributes) return {};
    const vals: Record<string, string> = {};
    for (const [defId, attr] of Object.entries(extensibleAttributes)) {
      vals[defId] = attr.value;
    }
    return vals;
  }, [extensibleAttributes]);

  const [currentHairColor, setCurrentHairColor] = useState(initialHairColor);
  const [weight, setWeight] = useState(initialWeight);
  const [build, setBuild] = useState(initialBuild);
  const [attrValues, setAttrValues] = useState<Record<string, string>>(initialAttrValues);
  const [expandedAttrGroups, setExpandedAttrGroups] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Check if any field was actually changed from its initial value
  const hairChanged = currentHairColor.trim() !== initialHairColor;
  const weightChanged = weight.trim() !== initialWeight;
  const buildChanged = build.trim() !== initialBuild;
  const attrChanged = Object.entries(attrValues).some(
    ([id, v]) => v.trim() !== (initialAttrValues[id] ?? ""),
  );
  const hasAnyChange = hairChanged || weightChanged || buildChanged || attrChanged;

  const handleSubmit = useCallback(() => {
    if (!hasAnyChange) {
      setError("Change at least one field before recording.");
      return;
    }
    startTransition(async () => {
      setError(null);
      // Only send changed extensible attributes
      const attributes = Object.entries(attrValues)
        .filter(([id, v]) => v.trim() !== (initialAttrValues[id] ?? ""))
        .filter(([, v]) => v.trim())
        .map(([definitionId, value]) => ({ definitionId, value: value.trim() }));

      const result = await recordPhysicalChangeAction(personId, {
        date: date || null,
        datePrecision,
        currentHairColor: hairChanged && currentHairColor.trim() ? currentHairColor.trim() : undefined,
        weight: weightChanged && weight.trim() ? parseFloat(weight) : undefined,
        build: buildChanged && build.trim() ? build.trim() : undefined,
        attributes: attributes.length > 0 ? attributes : undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to record change.");
        return;
      }
      onClose();
    });
  }, [personId, date, datePrecision, currentHairColor, weight, build, attrValues, hasAnyChange, hairChanged, weightChanged, buildChanged, initialAttrValues, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">Record Physical Change</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <p className="text-sm text-muted-foreground">
            Current values are pre-filled. Change only what&apos;s different — unchanged fields are ignored.
          </p>

          {/* Date + Precision */}
          <PartialDateInput
            dateValue={date}
            precisionValue={datePrecision}
            onDateChange={setDate}
            onPrecisionChange={setDatePrecision}
            label="When"
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium">Current Hair Color</label>
            <SelectWithOther
              options={CURRENT_HAIR_COLOR_OPTIONS}
              value={currentHairColor || undefined}
              onChange={(v) => setCurrentHairColor(v ?? "")}
              placeholder="Select hair color…"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Weight (kg)</label>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 65"
              step="0.1"
              min="0"
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Build</label>
            <SelectWithOther
              options={BUILD_OPTIONS}
              value={build || undefined}
              onChange={(v) => setBuild(v ?? "")}
              placeholder="Select build…"
            />
          </div>

          {/* Extensible Physical Attributes */}
          {attributeGroups && attributeGroups.length > 0 && (
            <div className="border-t border-white/10 pt-4 space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Additional Measurements</h3>
              {attributeGroups.map((group) => {
                const isExpanded = expandedAttrGroups.has(group.id);
                return (
                  <div key={group.id} className="rounded-lg border border-white/10 bg-muted/20">
                    <button
                      type="button"
                      onClick={() => setExpandedAttrGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.id)) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      })}
                      className="flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight size={14} className={cn("transition-transform", isExpanded && "rotate-90")} />
                      {group.name}
                      <span className="text-xs font-normal text-muted-foreground/50">{group.definitions.length}</span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-white/5 px-3 pb-3 pt-2 space-y-3">
                        {group.definitions.map((def) => (
                          <div key={def.id}>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                              {def.name}{def.unit ? ` (${def.unit})` : ""}
                            </label>
                            <input
                              type="text"
                              value={attrValues[def.id] ?? ""}
                              onChange={(e) => setAttrValues((prev) => ({ ...prev, [def.id]: e.target.value }))}
                              placeholder={def.unit ? `e.g. value in ${def.unit}` : "Value..."}
                              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !hasAnyChange}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Record Change"}
          </button>
        </div>
      </div>
    </div>
  );
}
