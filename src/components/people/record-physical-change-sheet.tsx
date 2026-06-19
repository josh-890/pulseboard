"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useEscToClose } from "@/lib/hooks/use-esc-to-close";
import { ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { recordPhysicalChangeAction } from "@/lib/actions/appearance-actions";
import type { PhysicalAttributeGroupWithDefinitions } from "@/lib/services/physical-attribute-catalog-service";
import type { PersonCurrentState } from "@/lib/types";
import { SelectWithOther } from "@/components/shared/select-with-other";
import { TypedAttributeInput } from "@/components/people/typed-attribute-input";
import { BUILD_OPTIONS, BREAST_SIZE_OPTIONS, CORE_PHYSICAL_ATTR_IDS, CHANGE_KIND_OPTIONS, type ChangeKind } from "@/lib/constants/appearance";
import { CoreFieldRow } from "@/components/people/core-field-row";

type RecordPhysicalChangeSheetProps = {
  personId: string;
  currentState?: PersonCurrentState;
  attributeGroups?: PhysicalAttributeGroupWithDefinitions[];
  onClose: () => void;
};

export function RecordPhysicalChangeSheet({ personId, currentState, attributeGroups, onClose }: RecordPhysicalChangeSheetProps) {
  const [isPending, startTransition] = useTransition();
  useEscToClose(onClose);

  // Phase G Slice 7 / ADR-0006: the date input is replaced by a 3-way
  // intent radio (on-date / dateless-draft / baseline). The default infers
  // from history — see hasAnyPriorHistory below.
  const hasAnyPriorHistory =
    (currentState?.currentHairColor ?? "") !== "" ||
    currentState?.weight != null ||
    (currentState?.build ?? "") !== "" ||
    (currentState?.breastSize ?? "") !== "" ||
    Object.keys(currentState?.extensibleAttributes ?? {}).length > 0;

  const [intent, setIntent] = useState<"on-date" | "dateless" | "baseline">(
    hasAnyPriorHistory ? "on-date" : "baseline",
  );
  const [date, setDate] = useState("");
  const [datePrecision, setDatePrecision] = useState("UNKNOWN");
  // ADR-0018: per-attribute change-kind for the (status-bearing) breast-size
  // delta. Rendered inline under the Breast Size field, not as a change-set header.
  const [breastKind, setBreastKind] = useState<ChangeKind>("NATURAL");

  // Pre-fill with current state values
  const initialHairColor = currentState?.currentHairColor ?? "";
  const initialWeight = currentState?.weight != null ? String(currentState.weight) : "";
  const initialBuild = currentState?.build ?? "";
  const initialBreastSize = currentState?.breastSize ?? "";
  const initialBreastDescription = currentState?.breastDescription ?? "";
  const extensibleAttributes = currentState?.extensibleAttributes;
  const initialAttrValues = useMemo(() => {
    if (!extensibleAttributes) return {};
    const vals: Record<string, string> = {};
    for (const [defId, attr] of Object.entries(extensibleAttributes)) {
      vals[defId] = attr.value;
    }
    return vals;
  }, [extensibleAttributes]);
  // Slice 16 follow-up: parallel state for the verified-unknown flag.
  const initialAttrUnknown = useMemo(() => {
    if (!extensibleAttributes) return {};
    const flags: Record<string, boolean> = {};
    for (const [defId, attr] of Object.entries(extensibleAttributes)) {
      flags[defId] = attr.isVerifiedUnknown;
    }
    return flags;
  }, [extensibleAttributes]);

  // Slice 16E: look up the hair_color catalog definition so TypedAttributeInput
  // can route to ColorValueCombobox via the new colorCategory annotation.
  const hairColorDef = useMemo(() => {
    for (const group of attributeGroups ?? []) {
      for (const def of group.definitions) {
        if (def.slug === "hair_color") return def;
      }
    }
    return null;
  }, [attributeGroups]);

  const [currentHairColor, setCurrentHairColor] = useState(initialHairColor);
  const [weight, setWeight] = useState(initialWeight);
  const [build, setBuild] = useState(initialBuild);
  const [breastSize, setBreastSize] = useState(initialBreastSize);
  const [breastDescription, setBreastDescription] = useState(initialBreastDescription);
  // Slice 16 follow-up: verified-unknown flags for the 4 core Tier 1 attrs
  // that have hardcoded UI in this sheet (Hair Color, Weight, Build, Breast Size).
  const initialCoreUnknown = currentState?.coreAttrUnknown ?? {
    hairColor: false,
    weight: false,
    build: false,
    breastSize: false,
  };
  const [hairColorUnknown, setHairColorUnknown] = useState(initialCoreUnknown.hairColor);
  const [weightUnknown, setWeightUnknown] = useState(initialCoreUnknown.weight);
  const [buildUnknown, setBuildUnknown] = useState(initialCoreUnknown.build);
  const [breastSizeUnknown, setBreastSizeUnknown] = useState(initialCoreUnknown.breastSize);
  const [attrValues, setAttrValues] = useState<Record<string, string>>(initialAttrValues);
  const [attrUnknown, setAttrUnknown] = useState<Record<string, boolean>>(initialAttrUnknown);
  const [expandedAttrGroups, setExpandedAttrGroups] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Check if any field was actually changed from its initial value
  const hairChanged =
    currentHairColor.trim() !== initialHairColor || hairColorUnknown !== initialCoreUnknown.hairColor;
  const weightChanged =
    weight.trim() !== initialWeight || weightUnknown !== initialCoreUnknown.weight;
  const buildChanged =
    build.trim() !== initialBuild || buildUnknown !== initialCoreUnknown.build;
  const breastSizeChanged =
    breastSize.trim() !== initialBreastSize || breastSizeUnknown !== initialCoreUnknown.breastSize;
  const breastDescChanged = breastDescription.trim() !== initialBreastDescription;
  const attrChanged =
    Object.entries(attrValues).some(
      ([id, v]) => v.trim() !== (initialAttrValues[id] ?? ""),
    ) ||
    Object.entries(attrUnknown).some(
      ([id, u]) => u !== (initialAttrUnknown[id] ?? false),
    );
  const hasAnyChange = hairChanged || weightChanged || buildChanged || breastSizeChanged || breastDescChanged || attrChanged;

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

  const handleSubmit = useCallback(() => {
    if (!hasAnyChange) {
      setError("Change at least one field before recording.");
      return;
    }
    startTransition(async () => {
      setError(null);
      // Only send changed extensible attributes. Verified-unknown deltas
      // are also sent (with empty value + flag) when toggled — those have
      // empty `value` so the old `.filter((_, v) => v.trim())` would drop
      // them. Send any entry where either the value OR the unknown flag
      // changed.
      const changedIds = new Set<string>();
      for (const [id, v] of Object.entries(attrValues)) {
        if (v.trim() !== (initialAttrValues[id] ?? "")) changedIds.add(id);
      }
      for (const [id, u] of Object.entries(attrUnknown)) {
        if (u !== (initialAttrUnknown[id] ?? false)) changedIds.add(id);
      }
      const attributes = Array.from(changedIds).map((definitionId) => ({
        definitionId,
        value: attrUnknown[definitionId] ? "" : (attrValues[definitionId] ?? "").trim(),
        isVerifiedUnknown: attrUnknown[definitionId] ?? false,
      }));

      const result = await recordPhysicalChangeAction(personId, {
        date: intent === "on-date" ? (date || null) : null,
        datePrecision: intent === "on-date" ? datePrecision : "UNKNOWN",
        intent,
        // Slice 16 follow-up: when the unknown flag is set, send `""` so the
        // action takes the verified-unknown branch (see PhysicalChangeData /
        // coreAttrUnknown plumbing in appearance-actions).
        currentHairColor: hairChanged ? (hairColorUnknown ? "" : currentHairColor.trim() || undefined) : undefined,
        weight: weightChanged ? (weightUnknown ? undefined : (weight.trim() ? parseFloat(weight) : undefined)) : undefined,
        build: buildChanged ? (buildUnknown ? "" : build.trim() || undefined) : undefined,
        breastSize: breastSizeChanged ? (breastSizeUnknown ? "" : breastSize.trim() || undefined) : undefined,
        breastDescription: breastDescChanged && breastDescription.trim() ? breastDescription.trim() : undefined,
        attributes: attributes.length > 0 ? attributes : undefined,
        breastKind: breastSizeChanged ? breastKind : undefined,
        coreAttrUnknown:
          hairColorUnknown || weightUnknown || buildUnknown || breastSizeUnknown
            ? {
                hairColor: hairChanged ? hairColorUnknown : undefined,
                weight: weightChanged ? weightUnknown : undefined,
                build: buildChanged ? buildUnknown : undefined,
                breastSize: breastSizeChanged ? breastSizeUnknown : undefined,
              }
            : undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to record change.");
        return;
      }
      onClose();
    });
  }, [personId, date, datePrecision, intent, breastKind, currentHairColor, weight, build, breastSize, breastDescription, attrValues, attrUnknown, hasAnyChange, hairChanged, weightChanged, buildChanged, breastSizeChanged, breastDescChanged, initialAttrValues, initialAttrUnknown, hairColorUnknown, weightUnknown, buildUnknown, breastSizeUnknown, onClose]);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex justify-end">
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

          {/* Phase G Slice 7 / ADR-0006: 3-way intent radio replaces the bare
              date input. Auto-clustering into draft Eras happens server-side
              based on the chosen intent. */}
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
            {intent === "on-date"
              ? "Filed into a draft Era and clustered with nearby changes."
              : intent === "dateless"
              ? "Filed into your Undated changes drawer until you fix the date."
              : "Added to baseline — applies as far back as records go."}
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
            <SelectWithOther
              options={BUILD_OPTIONS}
              value={build || undefined}
              onChange={(v) => setBuild(v ?? "")}
              placeholder="Select build…"
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

          {/* ADR-0018: change-kind for the breast-size delta — inline, so it
              reads as a property of this attribute, not the whole change-set.
              Surgical kinds (Augmentation/Reduction/Reversal) drive the status. */}
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

          {/* Extensible Physical Attributes — core attrs (hair color, weight,
              build, breast size, measurements) are SKIPPED here because they
              have dedicated UI above; rendering them here too would duplicate
              the input AND (critically for hair color) bypass the
              color_catalog ecosystem in favour of a generic text field. */}
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
                      // Bespoke conditional gating, mirroring the Ethnicity
                      // Broad→Specific pattern (see ethnicity-fields.tsx). Catalog-
                      // level conditionality is deferred; only Freckles dependent
                      // fields are handled here.
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

