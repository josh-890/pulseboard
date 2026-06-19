"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useEscToClose } from "@/lib/hooks/use-esc-to-close";
import { ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { updatePhysicalChangeAction } from "@/lib/actions/appearance-actions";
import type { PhysicalAttributeGroupWithDefinitions } from "@/lib/services/physical-attribute-catalog-service";
import { SelectWithOther } from "@/components/shared/select-with-other";
import { TypedAttributeInput } from "@/components/people/typed-attribute-input";
import { CoreFieldRow } from "@/components/people/core-field-row";
import { CHANGE_KIND_OPTIONS, type ChangeKind } from "@/lib/constants/appearance";
import type { DeltaCause } from "@/generated/prisma/client";
import { BREAST_SIZE_OPTIONS, CORE_PHYSICAL_ATTR_IDS } from "@/lib/constants/appearance";

type PhysicalAttributeItem = {
  definitionId: string;
  name: string;
  unit: string | null;
  value: string;
  isVerifiedUnknown?: boolean;
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
  breastDescription: string | null;
  cause: DeltaCause;
  // Slice 16 follow-up: verified-unknown flags per core field on this Era.
  hairColorUnknown?: boolean;
  weightUnknown?: boolean;
  buildUnknown?: boolean;
  breastSizeUnknown?: boolean;
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

  // Phase G Slice 7 / ADR-0006: intent radio mirrors the record sheet.
  // Initial value reflects the item's current Era assignment.
  // Note: Slice 7 keeps the existing Era on save; Slice 8 will wire the
  // re-cluster-on-edit logic for deltas in draft Eras.
  const initIntent: "on-date" | "dateless" | "baseline" = item.isBaseline
    ? "baseline"
    : item.date
      ? "on-date"
      : "dateless";
  const [intent, setIntent] = useState<"on-date" | "dateless" | "baseline">(initIntent);
  const [date, setDate] = useState(initDate);
  const [datePrecision, setDatePrecision] = useState(initPrec);
  // ADR-0007/0018: pre-load the Era's existing breast change-kind (threaded in
  // via the item) so editing for an unrelated reason doesn't silently reset its
  // status. Legacy SURGICAL coerces to AUGMENTATION (the only past surgical case).
  const [breastKind, setBreastKind] = useState<ChangeKind>(
    item.cause === "SURGICAL" ? "AUGMENTATION" : item.cause,
  );
  const [currentHairColor, setCurrentHairColor] = useState(item.currentHairColor ?? "");
  const [weight, setWeight] = useState(item.weight !== null ? String(item.weight) : "");
  const [build, setBuild] = useState(item.build ?? "");
  const [breastSize, setBreastSize] = useState(item.breastSize ?? "");
  const [breastDescription, setBreastDescription] = useState(item.breastDescription ?? "");
  // Slice 16 follow-up: verified-unknown flags for the 4 core fields.
  const [hairColorUnknown, setHairColorUnknown] = useState(item.hairColorUnknown ?? false);
  const [weightUnknown, setWeightUnknown] = useState(item.weightUnknown ?? false);
  const [buildUnknown, setBuildUnknown] = useState(item.buildUnknown ?? false);
  const [breastSizeUnknown, setBreastSizeUnknown] = useState(item.breastSizeUnknown ?? false);
  // Initialize extensible attribute values from existing item
  const [attrValues, setAttrValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const attr of item.attributes) {
      init[attr.definitionId] = attr.value;
    }
    return init;
  });
  // Slice 16 follow-up: verified-unknown flag per attr.
  const [attrUnknown, setAttrUnknown] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const attr of item.attributes) {
      init[attr.definitionId] = attr.isVerifiedUnknown ?? false;
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

  const hasAnyAttr = Object.values(attrValues).some((v) => v.trim()) || Object.values(attrUnknown).some(Boolean);
  // Verified-unknown flags also count as "filled" for the submit gate.
  const hasAnyField =
    currentHairColor.trim() ||
    weight.trim() ||
    build.trim() ||
    breastSize.trim() ||
    breastDescription.trim() ||
    hairColorUnknown ||
    weightUnknown ||
    buildUnknown ||
    breastSizeUnknown ||
    hasAnyAttr;

  // ADR-0018: breast_size carries an inline change-kind picker iff it's flagged
  // status-bearing in the catalog (the only such core attr today).
  const breastIsStatusBearing = useMemo(() => {
    for (const g of attributeGroups ?? []) {
      for (const d of g.definitions) {
        if (d.id === "cattr-breast-size") return d.statusBearing;
      }
    }
    return false;
  }, [attributeGroups]);

  // Slice 16E: look up the hair_color catalog definition for TypedAttributeInput
  // (which routes to ColorValueCombobox via the colorCategory annotation).
  const hairColorDef = useMemo(() => {
    for (const group of attributeGroups ?? []) {
      for (const def of group.definitions) {
        if (def.slug === "hair_color") return def;
      }
    }
    return null;
  }, [attributeGroups]);

  const handleSubmit = useCallback(() => {
    if (!hasAnyField) {
      setError("At least one physical field is required.");
      return;
    }
    startTransition(async () => {
      setError(null);
      // Include attrs that have a value OR are marked unknown.
      const ids = new Set<string>([
        ...Object.entries(attrValues).filter(([, v]) => v.trim()).map(([id]) => id),
        ...Object.entries(attrUnknown).filter(([, u]) => u).map(([id]) => id),
      ]);
      const attributes = Array.from(ids).map((definitionId) => ({
        definitionId,
        value: attrUnknown[definitionId] ? "" : (attrValues[definitionId] ?? "").trim(),
        isVerifiedUnknown: attrUnknown[definitionId] ?? false,
      }));

      const result = await updatePhysicalChangeAction(item.eraId, personId, {
        date: intent === "on-date" ? (date || null) : null,
        datePrecision: intent === "on-date" ? datePrecision : "UNKNOWN",
        intent,
        // When a field is marked unknown, send "" so the action takes the
        // verified-unknown branch via coreAttrUnknown below.
        currentHairColor: hairColorUnknown ? "" : (currentHairColor.trim() || undefined),
        weight: weightUnknown ? undefined : (weight.trim() ? parseFloat(weight) : undefined),
        build: buildUnknown ? "" : (build.trim() || undefined),
        breastSize: breastSizeUnknown ? "" : (breastSize.trim() || undefined),
        breastDescription: breastDescription.trim() || undefined,
        attributes: attributes.length > 0 ? attributes : undefined,
        breastKind,
        coreAttrUnknown:
          hairColorUnknown || weightUnknown || buildUnknown || breastSizeUnknown
            ? {
                hairColor: hairColorUnknown,
                weight: weightUnknown,
                build: buildUnknown,
                breastSize: breastSizeUnknown,
              }
            : undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to update change.");
        return;
      }
      onClose();
    });
  }, [item.eraId, personId, date, datePrecision, intent, currentHairColor, weight, build, breastSize, breastDescription, attrValues, attrUnknown, hairColorUnknown, weightUnknown, buildUnknown, breastSizeUnknown, hasAnyField, breastKind, onClose]);

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

          {/* Phase G Slice 7 / ADR-0006: 3-way intent radio mirrors the
              record sheet. Slice 7 keeps the existing Era on save —
              Slice 8 wires draft-Era re-clustering. */}
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium">When did this change?</legend>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="intent"
                value="on-date"
                checked={intent === "on-date"}
                onChange={() => setIntent("on-date")}
                className="mt-1 cursor-pointer"
              />
              <div className="flex-1 space-y-2">
                <span className="text-sm">On this date</span>
                {intent === "on-date" && (
                  <PartialDateInput
                    dateValue={date}
                    precisionValue={datePrecision}
                    onDateChange={setDate}
                    onPrecisionChange={setDatePrecision}
                    label=""
                  />
                )}
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="intent"
                value="dateless"
                checked={intent === "dateless"}
                onChange={() => setIntent("dateless")}
                className="mt-1 cursor-pointer"
              />
              <span className="text-sm">I don&apos;t know when yet</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="intent"
                value="baseline"
                checked={intent === "baseline"}
                onChange={() => setIntent("baseline")}
                className="mt-1 cursor-pointer"
              />
              <span className="text-sm">Actually, this was always true (baseline)</span>
            </label>
          </fieldset>

          <p className="text-xs text-muted-foreground -mt-2">
            {item.isBaseline
              ? `Editing within ${item.eraLabel}. Picking a date or "I don't know yet" moves this out of baseline into a draft Era.`
              : `Editing within ${item.eraLabel}. Date or intent changes re-cluster automatically while this Era is still a draft; once you name it, membership locks.`}
          </p>

          <CoreFieldRow label="Hair Color" unknown={hairColorUnknown} onUnknownChange={(v) => { setHairColorUnknown(v); if (v) setCurrentHairColor(""); }}>
            {hairColorDef && (
              <TypedAttributeInput
                definition={hairColorDef}
                value={currentHairColor}
                onChange={setCurrentHairColor}
              />
            )}
          </CoreFieldRow>

          <CoreFieldRow label="Weight (kg)" unknown={weightUnknown} onUnknownChange={(v) => { setWeightUnknown(v); if (v) setWeight(""); }}>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 65"
              step="0.1"
              min="0"
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </CoreFieldRow>

          <CoreFieldRow label="Build" unknown={buildUnknown} onUnknownChange={(v) => { setBuildUnknown(v); if (v) setBuild(""); }}>
            <input
              type="text"
              value={build}
              onChange={(e) => setBuild(e.target.value)}
              placeholder="e.g. slim, athletic, muscular..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </CoreFieldRow>

          <CoreFieldRow label="Breast Size" unknown={breastSizeUnknown} onUnknownChange={(v) => { setBreastSizeUnknown(v); if (v) setBreastSize(""); }}>
            <SelectWithOther
              options={BREAST_SIZE_OPTIONS}
              value={breastSize || undefined}
              onChange={(v) => setBreastSize(v ?? "")}
              placeholder="Select cup size…"
            />
          </CoreFieldRow>

          {/* ADR-0018: change-kind for the breast-size delta — inline, per-attribute. */}
          {breastIsStatusBearing && !breastSizeUnknown && (
            <div className="-mt-1 pl-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Kind</label>
              <select
                value={breastKind}
                onChange={(e) => setBreastKind(e.target.value as ChangeKind)}
                className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {CHANGE_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

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
                    {isExpanded && (() => {
                      // Bespoke conditional gating mirroring the Ethnicity
                      // Broad→Specific pattern. See record-physical-change-sheet
                      // for the matching block.
                      const frecklesDef = group.definitions.find((d) => d.slug === "freckles");
                      const frecklesValue = frecklesDef
                        ? (attrValues[frecklesDef.id] ?? "").trim().toLowerCase()
                        : "";
                      const frecklesGated = frecklesValue === "" || frecklesValue === "no";
                      const FRECKLES_DEPENDENT = new Set(["freckle-intensity", "freckle-location"]);
                      const visible = group.definitions.filter(
                        (d) => !(frecklesGated && FRECKLES_DEPENDENT.has(d.slug)),
                      );
                      return (
                        <div className="border-t border-white/5 px-3 pb-3 pt-2 space-y-3">
                          {visible.map((def) => (
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
                                isVerifiedUnknown={attrUnknown[def.id] ?? false}
                                onVerifiedUnknownChange={(u) =>
                                  setAttrUnknown((prev) => ({ ...prev, [def.id]: u }))
                                }
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}
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
