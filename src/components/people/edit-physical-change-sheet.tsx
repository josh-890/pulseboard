"use client";

import { useCallback, useState, useTransition } from "react";
import { useEscToClose } from "@/lib/hooks/use-esc-to-close";
import { ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { updatePhysicalChangeAction } from "@/lib/actions/appearance-actions";
import type { PhysicalAttributeGroupWithDefinitions } from "@/lib/services/physical-attribute-catalog-service";
import { SelectWithOther } from "@/components/shared/select-with-other";
import { ColorValueCombobox } from "@/components/people/color-value-combobox";
import { TypedAttributeInput } from "@/components/people/typed-attribute-input";
import { BREAST_SIZE_OPTIONS, BREAST_STATUS_OPTIONS, CORE_PHYSICAL_ATTR_IDS } from "@/lib/constants/appearance";

type PhysicalAttributeItem = {
  definitionId: string;
  name: string;
  unit: string | null;
  value: string;
};

type PhysicalChangeItem = {
  eraId: string;
  eraLabel: string;
  isBaseline: boolean;
  date: Date | null;
  datePrecision: string;
  currentHairColor: string | null;
  weight: number | null;
  build: string | null;
  breastSize: string | null;
  breastStatus: string | null;
  breastDescription: string | null;
  attributes: PhysicalAttributeItem[];
};

type EditPhysicalChangeSheetProps = {
  personId: string;
  item: PhysicalChangeItem;
  attributeGroups?: PhysicalAttributeGroupWithDefinitions[];
  onClose: () => void;
};

export function EditPhysicalChangeSheet({ personId, item, attributeGroups, onClose }: EditPhysicalChangeSheetProps) {
  const [isPending, startTransition] = useTransition();
  useEscToClose(onClose);

  const initDate = item.isBaseline
    ? ""
    : item.date
      ? (() => {
          return new Date(item.date).toISOString().slice(0, 10);
        })()
      : "";
  const initPrec = item.isBaseline ? "UNKNOWN" : (item.datePrecision ?? "UNKNOWN");

  const [date, setDate] = useState(initDate);
  const [datePrecision, setDatePrecision] = useState(initPrec);
  // Phase G Slice 4 / ADR-0007: the edit sheet doesn't know the existing
  // delta's cause without an extra service call, so default it to NATURAL.
  // Selecting SURGICAL here will tag the (re-written) deltas accordingly.
  const [cause, setCause] = useState<"NATURAL" | "SURGICAL" | "OTHER">("NATURAL");
  const [currentHairColor, setCurrentHairColor] = useState(item.currentHairColor ?? "");
  const [weight, setWeight] = useState(item.weight !== null ? String(item.weight) : "");
  const [build, setBuild] = useState(item.build ?? "");
  const [breastSize, setBreastSize] = useState(item.breastSize ?? "");
  const [breastStatus, setBreastStatus] = useState(item.breastStatus ?? "");
  const [breastDescription, setBreastDescription] = useState(item.breastDescription ?? "");
  // Initialize extensible attribute values from existing item
  const [attrValues, setAttrValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const attr of item.attributes) {
      init[attr.definitionId] = attr.value;
    }
    return init;
  });
  const [expandedAttrGroups, setExpandedAttrGroups] = useState<Set<string>>(() => {
    // Auto-expand groups that have existing values
    const groupIds = new Set<string>();
    if (attributeGroups) {
      for (const group of attributeGroups) {
        for (const def of group.definitions) {
          if (attrValues[def.id]) {
            groupIds.add(group.id);
            break;
          }
        }
      }
    }
    return groupIds;
  });
  const [error, setError] = useState<string | null>(null);

  const hasAnyAttr = Object.values(attrValues).some((v) => v.trim());
  const hasAnyField = currentHairColor.trim() || weight.trim() || build.trim() || breastSize.trim() || breastStatus.trim() || breastDescription.trim() || hasAnyAttr;

  // Phase G Slice 6½ / ADR-0007 amendment: gate the Cause picker on at least
  // one status-bearing attr being present in this Era's editable set.
  const statusBearingDefIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of attributeGroups ?? []) {
      for (const d of g.definitions) {
        if (d.statusBearing) ids.add(d.id);
      }
    }
    return ids;
  }, [attributeGroups]);

  const anyStatusBearingInForm = useMemo(() => {
    if (breastSize.trim() && statusBearingDefIds.has("cattr-breast-size")) return true;
    if (currentHairColor.trim() && statusBearingDefIds.has("cattr-hair-color")) return true;
    if (weight.trim() && statusBearingDefIds.has("cattr-weight")) return true;
    if (build.trim() && statusBearingDefIds.has("cattr-build")) return true;
    for (const [id, v] of Object.entries(attrValues)) {
      if (v.trim() && statusBearingDefIds.has(id)) return true;
    }
    return false;
  }, [breastSize, currentHairColor, weight, build, attrValues, statusBearingDefIds]);

  const handleSubmit = useCallback(() => {
    if (!hasAnyField) {
      setError("At least one physical field is required.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const attributes = Object.entries(attrValues)
        .filter(([, v]) => v.trim())
        .map(([definitionId, value]) => ({ definitionId, value: value.trim() }));

      const result = await updatePhysicalChangeAction(item.eraId, personId, {
        date: date || null,
        datePrecision,
        currentHairColor: currentHairColor.trim() || undefined,
        weight: weight.trim() ? parseFloat(weight) : undefined,
        build: build.trim() || undefined,
        breastSize: breastSize.trim() || undefined,
        breastStatus: breastStatus.trim() || undefined,
        breastDescription: breastDescription.trim() || undefined,
        attributes: attributes.length > 0 ? attributes : undefined,
        cause,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to update change.");
        return;
      }
      onClose();
    });
  }, [item.eraId, personId, date, datePrecision, currentHairColor, weight, build, breastSize, breastStatus, breastDescription, attrValues, hasAnyField, cause, onClose]);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">Edit Physical Change</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <p className="text-sm text-muted-foreground">
            Editing physical change from <span className="font-medium text-foreground">{item.eraLabel}</span>.
          </p>

          <PartialDateInput
            dateValue={date}
            precisionValue={datePrecision}
            onDateChange={setDate}
            onPrecisionChange={setDatePrecision}
            label="When"
          />

          {/* Phase G Slice 4 / ADR-0007 + Slice 6½ amendment: Cause select
              only renders when at least one status-bearing attr is in this
              Era's form. */}
          {anyStatusBearingInForm && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">Cause</label>
              <select
                value={cause}
                onChange={(e) => setCause(e.target.value as "NATURAL" | "SURGICAL" | "OTHER")}
                className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="NATURAL">Natural</option>
                <option value="SURGICAL">Surgical</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium">Current Hair Color</label>
            <ColorValueCombobox
              category="hair"
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
            <input
              type="text"
              value={build}
              onChange={(e) => setBuild(e.target.value)}
              placeholder="e.g. slim, athletic, muscular..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Breast Size</label>
            <SelectWithOther
              options={BREAST_SIZE_OPTIONS}
              value={breastSize || undefined}
              onChange={(v) => setBreastSize(v ?? "")}
              placeholder="Select cup size…"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Breast Status</label>
            <SelectWithOther
              options={BREAST_STATUS_OPTIONS}
              value={breastStatus || undefined}
              onChange={(v) => setBreastStatus(v ?? "")}
              placeholder="Select status…"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Breast Description</label>
            <input
              type="text"
              value={breastDescription}
              onChange={(e) => setBreastDescription(e.target.value)}
              placeholder="e.g. Large (Real)"
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Extensible Physical Attributes — core attrs skipped (see
              record-physical-change-sheet for rationale + ADR-0005 background). */}
          {attributeGroups && attributeGroups.length > 0 && (() => {
            const nonCoreGroups = attributeGroups
              .map((g) => ({
                ...g,
                definitions: g.definitions.filter((d) => !CORE_PHYSICAL_ATTR_IDS.has(d.id)),
              }))
              .filter((g) => g.definitions.length > 0);
            if (nonCoreGroups.length === 0) return null;
            return (
            <div className="border-t border-white/10 pt-4 space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Additional Measurements</h3>
              {nonCoreGroups.map((group) => {
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
                            {def.valueType !== "BOOLEAN" && (
                              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                                {def.name}{def.unit ? ` (${def.unit})` : ""}
                              </label>
                            )}
                            <TypedAttributeInput
                              definition={def}
                              value={attrValues[def.id] ?? ""}
                              onChange={(v) => setAttrValues((prev) => ({ ...prev, [def.id]: v }))}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            );
          })()}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !hasAnyField}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}
