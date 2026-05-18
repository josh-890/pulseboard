"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { BodyRegionFilter } from "@/components/shared/body-region-picker/body-region-filter";
import { SavedSearchMenu } from "@/components/people/saved-search-menu";
import type { SavedSearchSummary } from "@/lib/services/saved-search-service";
import { cn } from "@/lib/utils";
import {
  EMPTY_SPEC,
  isEmptySpec,
  specFromUrlParams,
  specToUrlParams,
  type CategoricalFilter,
  type FilterSpec,
  type PresenceField,
  type PresenceFilter,
  type TimeScope,
} from "@/lib/types/filter-spec";
import {
  HAIR_SHADE_ORDER,
  EYE_SHADE_ORDER,
  SKIN_TONE_ORDER,
  SKIN_UNDERTONE_ORDER,
} from "@/lib/constants/color-catalog";

// ─── Section shell ───────────────────────────────────────────────────────────

function Section({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/10 py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-white/5"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {title}
        </span>
        {badge != null && badge > 0 && (
          <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="mt-2 space-y-2 px-2">{children}</div>}
    </div>
  );
}

// ─── Categorical filter (facet list + optional family toggle) ────────────────

type FacetOption = { value: string; count: number };

function CategoricalControl({
  field,
  facets,
  order,
  spec,
  onChange,
}: {
  field: string;
  facets: FacetOption[];
  // optional canonical ordering for the options (e.g. shade dark→light)
  order?: readonly string[];
  spec: FilterSpec;
  onChange: (next: FilterSpec) => void;
}) {
  const current = spec.categorical.find((c) => c.field === field);
  const selected = new Set(current?.values ?? []);

  // Use canonical ordering when supplied; ensure every ordered value appears
  // (with count 0 if absent from facets) so the UI stays stable.
  const options: FacetOption[] = order
    ? order.map((v) => facets.find((f) => f.value === v) ?? { value: v, count: 0 })
    : facets;

  const update = (nextValues: string[]) => {
    const others = spec.categorical.filter((c) => c.field !== field);
    if (nextValues.length === 0) {
      onChange({ ...spec, categorical: others });
    } else {
      const next: CategoricalFilter = { field, values: nextValues, mode: "exact" };
      onChange({ ...spec, categorical: [...others, next] });
    }
  };

  const toggle = (val: string) => {
    if (selected.has(val)) {
      update([...selected].filter((v) => v !== val));
    } else {
      update([...selected, val]);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
        {options.length === 0 && (
          <p className="text-xs text-muted-foreground/60">No options</p>
        )}
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-white/5"
          >
            <Checkbox
              checked={selected.has(opt.value)}
              onCheckedChange={() => toggle(opt.value)}
            />
            <span className="flex-1 truncate">{opt.value}</span>
            <span className="text-[10px] text-muted-foreground/60">{opt.count}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Range filter (min/max numeric inputs) ──────────────────────────────────

function RangeControl({
  field,
  unit,
  bounds,
  spec,
  onChange,
}: {
  field: string;
  unit?: string;
  bounds?: { min: number; max: number };
  spec: FilterSpec;
  onChange: (next: FilterSpec) => void;
}) {
  const current = spec.range.find((r) => r.field === field);
  const specMinStr = current?.min != null ? String(current.min) : "";
  const specMaxStr = current?.max != null ? String(current.max) : "";

  // Local "dirty" buffer for in-progress typing; null = follow URL spec exactly
  const [localMin, setLocalMin] = useState<string | null>(null);
  const [localMax, setLocalMax] = useState<string | null>(null);
  const minStr = localMin ?? specMinStr;
  const maxStr = localMax ?? specMaxStr;

  const commit = useCallback((nextMin: string, nextMax: string) => {
    const min = nextMin === "" ? undefined : Number(nextMin);
    const max = nextMax === "" ? undefined : Number(nextMax);
    const others = spec.range.filter((r) => r.field !== field);
    if (min == null && max == null) {
      onChange({ ...spec, range: others });
    } else {
      onChange({ ...spec, range: [...others, { field, min, max }] });
    }
  }, [field, spec, onChange]);

  useEffect(() => {
    if (localMin == null && localMax == null) return;
    const handle = setTimeout(() => {
      if (minStr !== "" && Number.isNaN(Number(minStr))) return;
      if (maxStr !== "" && Number.isNaN(Number(maxStr))) return;
      if (minStr === specMinStr && maxStr === specMaxStr) {
        setLocalMin(null);
        setLocalMax(null);
        return;
      }
      commit(minStr, maxStr);
      setLocalMin(null);
      setLocalMax(null);
    }, 350);
    return () => clearTimeout(handle);
  }, [localMin, localMax, minStr, maxStr, specMinStr, specMaxStr, commit]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          value={minStr}
          onChange={(e) => setLocalMin(e.target.value)}
          placeholder={bounds ? String(bounds.min) : "min"}
          className="h-7 w-16 px-1.5 text-center text-xs"
          inputMode="numeric"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          value={maxStr}
          onChange={(e) => setLocalMax(e.target.value)}
          placeholder={bounds ? String(bounds.max) : "max"}
          className="h-7 w-16 px-1.5 text-center text-xs"
          inputMode="numeric"
        />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

// ─── Attribute filter (catalog-driven, exact value match) ────────────────────

export type AttributeOption = {
  definitionId: string;
  slug: string;
  name: string;
  groupName: string;
};

function AttributeControl({
  option,
  facets,
  spec,
  onChange,
}: {
  option: AttributeOption;
  facets?: { value: string; count: number }[];
  spec: FilterSpec;
  onChange: (next: FilterSpec) => void;
}) {
  const current = spec.attribute.find((a) => a.definitionId === option.definitionId);
  const selected = new Set(current?.values ?? []);

  const update = (nextValues: string[]) => {
    const others = spec.attribute.filter((a) => a.definitionId !== option.definitionId);
    if (nextValues.length === 0) {
      onChange({ ...spec, attribute: others });
    } else {
      onChange({ ...spec, attribute: [...others, { definitionId: option.definitionId, values: nextValues }] });
    }
  };

  const toggle = (val: string) => {
    if (selected.has(val)) update([...selected].filter((v) => v !== val));
    else update([...selected, val]);
  };

  const opts = facets ?? [];

  return (
    <div className="space-y-1">
      <div className="text-[11px] text-muted-foreground">{option.name}</div>
      {opts.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60">No recorded values yet</p>
      ) : (
        <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
          {opts.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-white/5"
            >
              <Checkbox
                checked={selected.has(opt.value)}
                onCheckedChange={() => toggle(opt.value)}
              />
              <span className="flex-1 truncate">{opt.value}</span>
              <span className="text-[10px] text-muted-foreground/60">{opt.count}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Presence + Region combined control ──────────────────────────────────────

function MarkPill({
  active,
  text,
  onClick,
}: {
  active: boolean;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded px-2 py-1 text-[11px]",
        active ? "bg-blue-500/20 text-blue-700 dark:text-blue-300" : "bg-white/5 hover:bg-white/10",
      )}
    >
      {text}
    </button>
  );
}

function MarkControl({
  field,
  label,
  counts,
  spec,
  onChange,
}: {
  field: PresenceField;
  label: string;
  counts?: { has: number; hasnt: number };
  spec: FilterSpec;
  onChange: (next: FilterSpec) => void;
}) {
  const presence = spec.presence.find((p) => p.field === field);
  const state = presence?.state ?? "any";
  const region = spec.region.find((r) => r.entity === field);
  const regions = region?.regions ?? [];
  const matchMode = region?.mode ?? "any";

  const updateState = (next: PresenceFilter["state"]) => {
    const others = spec.presence.filter((p) => p.field !== field);
    const nextPresence = next === "any" ? others : [...others, { field, state: next }];
    // If user turned the filter off / set to hasn't, also clear regions for this entity
    const nextRegion = next === "has" ? spec.region : spec.region.filter((r) => r.entity !== field);
    onChange({ ...spec, presence: nextPresence, region: nextRegion });
  };

  const updateRegions = (next: string[]) => {
    const others = spec.region.filter((r) => r.entity !== field);
    if (next.length === 0) {
      onChange({ ...spec, region: others });
    } else {
      onChange({ ...spec, region: [...others, { entity: field, regions: next, mode: matchMode }] });
    }
  };

  const updateMatchMode = (next: "any" | "all") => {
    const others = spec.region.filter((r) => r.entity !== field);
    if (regions.length === 0) return;
    onChange({ ...spec, region: [...others, { entity: field, regions, mode: next }] });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span>{label}</span>
        {counts && state === "any" && (
          <span className="text-[10px] text-muted-foreground/60">
            {counts.has} / {counts.hasnt}
          </span>
        )}
      </div>
      <div className="flex gap-1">
        <MarkPill active={state === "has"}   text="has"    onClick={() => updateState("has")} />
        <MarkPill active={state === "any"}   text="any"    onClick={() => updateState("any")} />
        <MarkPill active={state === "hasnt"} text="hasn't" onClick={() => updateState("hasnt")} />
      </div>
      {state === "has" && (
        <div className="pt-1">
          <BodyRegionFilter
            selected={regions}
            onChange={updateRegions}
            matchMode={matchMode}
            onMatchModeChange={updateMatchMode}
          />
        </div>
      )}
    </div>
  );
}

// ─── Active filter chips ─────────────────────────────────────────────────────

function ActiveChips({
  spec,
  onChange,
}: {
  spec: FilterSpec;
  onChange: (next: FilterSpec) => void;
}) {
  if (isEmptySpec(spec)) return null;

  const removeCategorical = (field: string, value: string) => {
    const filters = spec.categorical
      .map((c) =>
        c.field === field ? { ...c, values: c.values.filter((v) => v !== value) } : c,
      )
      .filter((c) => c.values.length > 0);
    onChange({ ...spec, categorical: filters });
  };
  const removePresence = (field: PresenceField) => {
    onChange({ ...spec, presence: spec.presence.filter((p) => p.field !== field) });
  };
  const removeRegion = (entity: PresenceField) => {
    onChange({ ...spec, region: spec.region.filter((r) => r.entity !== entity) });
  };
  const removeRange = (field: string) => {
    onChange({ ...spec, range: spec.range.filter((r) => r.field !== field) });
  };
  const removeAttribute = (definitionId: string) => {
    onChange({ ...spec, attribute: spec.attribute.filter((a) => a.definitionId !== definitionId) });
  };
  const removeText = (field: string) => {
    onChange({ ...spec, text: spec.text.filter((t) => t.field !== field) });
  };

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  for (const c of spec.categorical) {
    for (const v of c.values) {
      chips.push({
        key: `cat-${c.field}-${v}`,
        label: `${c.field}: ${v}${c.mode === "family" ? " (family)" : ""}`,
        onRemove: () => removeCategorical(c.field, v),
      });
    }
  }
  for (const p of spec.presence) {
    if (p.state === "any") continue;
    chips.push({
      key: `presence-${p.field}`,
      label: `${p.field}: ${p.state}`,
      onRemove: () => removePresence(p.field),
    });
  }
  for (const r of spec.region) {
    if (r.regions.length === 0) continue;
    chips.push({
      key: `region-${r.entity}`,
      label: `${r.entity} @ ${r.regions.length} region${r.regions.length === 1 ? "" : "s"}${r.mode === "all" ? " (all)" : ""}`,
      onRemove: () => removeRegion(r.entity),
    });
  }
  for (const r of spec.range) {
    const bits: string[] = [];
    if (r.min != null) bits.push(`≥${r.min}`);
    if (r.max != null) bits.push(`≤${r.max}`);
    if (bits.length === 0) continue;
    chips.push({
      key: `range-${r.field}`,
      label: `${r.field}: ${bits.join(" ")}`,
      onRemove: () => removeRange(r.field),
    });
  }
  for (const a of spec.attribute) {
    if (a.values.length === 0) continue;
    chips.push({
      key: `attr-${a.definitionId}`,
      label: `${a.definitionId.slice(0, 6)}…: ${a.values.join(", ")}`,
      onRemove: () => removeAttribute(a.definitionId),
    });
  }
  for (const t of spec.text) {
    if (!t.query) continue;
    chips.push({
      key: `text-${t.field}`,
      label: `${t.field}~${t.query}`,
      onRemove: () => removeText(t.field),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-3 py-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="group inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-700 dark:text-blue-300 hover:bg-blue-500/20"
        >
          {chip.label}
          <X size={10} className="opacity-60 group-hover:opacity-100" />
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...EMPTY_SPEC, timeScope: spec.timeScope })}
        className="ml-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        Reset all
      </button>
    </div>
  );
}

// ─── Time scope toggle ───────────────────────────────────────────────────────

function TimeScopeToggle({
  scope,
  onChange,
  disabled,
}: {
  scope: TimeScope;
  onChange: (next: TimeScope) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5 text-[11px]",
        disabled && "opacity-50",
      )}
      title={disabled ? "Coming soon — historical persona search" : ""}
    >
      <button
        type="button"
        onClick={() => onChange("current")}
        disabled={disabled}
        className={cn(
          "flex-1 rounded-full px-2 py-0.5",
          scope === "current" ? "bg-blue-500/20 text-blue-700 dark:text-blue-300" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Current
      </button>
      <button
        type="button"
        onClick={() => onChange("ever")}
        disabled={disabled}
        className={cn(
          "flex-1 rounded-full px-2 py-0.5",
          scope === "ever" ? "bg-blue-500/20 text-blue-700 dark:text-blue-300" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Ever
      </button>
    </div>
  );
}

// ─── Main sidebar ────────────────────────────────────────────────────────────

export type AttributeGroupForFilter = {
  groupName: string;
  options: AttributeOption[];
};

export type PeopleSearchSidebarProps = {
  facets: {
    categorical: Record<string, FacetOption[]>;
    presence: Record<string, { has: number; hasnt: number }>;
    attribute?: Record<string, FacetOption[]>;
  };
  attributeGroups?: AttributeGroupForFilter[];
  savedSearches?: SavedSearchSummary[];
};

export function PeopleSearchSidebar({
  facets,
  attributeGroups = [],
  savedSearches = [],
}: PeopleSearchSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Read the current spec from the URL on every render — single source of truth.
  const spec = useMemo<FilterSpec>(() => specFromUrlParams(searchParams), [searchParams]);

  // Local text input state (debounced) for the search field
  const initialName = spec.text.find((t) => t.field === "name")?.query ?? "";
  const [nameInput, setNameInput] = useState(initialName);

  // Sync local input with URL when navigating externally (e.g. clear)
  useEffect(() => {
    setNameInput(initialName);
  }, [initialName]);

  const apply = useCallback(
    (next: FilterSpec) => {
      const params = specToUrlParams(next);
      // Preserve any non-FilterSpec params (e.g. groupBy, slot)
      for (const [k, v] of searchParams.entries()) {
        if (
          k.startsWith("cat.") ||
          k.startsWith("range.") ||
          k.startsWith("presence.") ||
          k.startsWith("region.") ||
          k.startsWith("text.") ||
          k.startsWith("attr.") ||
          k === "time"
        ) {
          continue;
        }
        if (!params.has(k)) params.set(k, v);
      }
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `/people?${qs}` : "/people", { scroll: false });
      });
    },
    [router, searchParams],
  );

  // Debounce the name input
  useEffect(() => {
    const handle = setTimeout(() => {
      if (nameInput === initialName) return;
      const others = spec.text.filter((t) => t.field !== "name");
      const nextText = nameInput
        ? [...others, { field: "name", query: nameInput, fuzzy: false }]
        : others;
      apply({ ...spec, text: nextText });
    }, 250);
    return () => clearTimeout(handle);
  }, [nameInput, initialName, spec, apply]);

  const countCategorical = (field: string) =>
    spec.categorical.find((c) => c.field === field)?.values.length ?? 0;
  const countPresence = (field: PresenceField) =>
    spec.presence.some((p) => p.field === field && p.state !== "any") ? 1 : 0;

  return (
    <aside className="sticky top-0 flex h-[calc(100vh-6rem)] w-72 flex-col gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-card/40 p-3 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Filters</h3>
        <Sparkles size={14} className="text-blue-600 dark:text-blue-400" />
      </div>

      <TimeScopeToggle
        scope={spec.timeScope}
        onChange={(next) => apply({ ...spec, timeScope: next })}
      />

      <SavedSearchMenu saved={savedSearches} currentSpec={spec} scope="people" />

      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Name or alias…"
          className="h-8 pl-7 text-xs"
        />
      </div>

      <ActiveChips spec={spec} onChange={apply} />

      <Section
        title="Hair · Hue"
        badge={countCategorical("hairHue")}
        defaultOpen
      >
        <CategoricalControl
          field="hairHue"
          facets={facets.categorical.hairHue ?? []}
          spec={spec}
          onChange={apply}
        />
      </Section>

      <Section
        title="Hair · Shade"
        badge={countCategorical("hairShade")}
      >
        <CategoricalControl
          field="hairShade"
          facets={facets.categorical.hairShade ?? []}
          order={HAIR_SHADE_ORDER}
          spec={spec}
          onChange={apply}
        />
      </Section>

      <Section title="Eye · Hue" badge={countCategorical("eyeHue")}>
        <CategoricalControl
          field="eyeHue"
          facets={facets.categorical.eyeHue ?? []}
          spec={spec}
          onChange={apply}
        />
      </Section>

      <Section title="Eye · Shade" badge={countCategorical("eyeShade")}>
        <CategoricalControl
          field="eyeShade"
          facets={facets.categorical.eyeShade ?? []}
          order={EYE_SHADE_ORDER}
          spec={spec}
          onChange={apply}
        />
      </Section>

      <Section title="Skin · Tone" badge={countCategorical("skinTone")}>
        <CategoricalControl
          field="skinTone"
          facets={facets.categorical.skinTone ?? []}
          order={SKIN_TONE_ORDER}
          spec={spec}
          onChange={apply}
        />
      </Section>

      <Section title="Skin · Undertone" badge={countCategorical("skinUndertone")}>
        <CategoricalControl
          field="skinUndertone"
          facets={facets.categorical.skinUndertone ?? []}
          order={SKIN_UNDERTONE_ORDER}
          spec={spec}
          onChange={apply}
        />
      </Section>

      <Section title="Body type" badge={countCategorical("bodyType")}>
        <CategoricalControl
          field="bodyType"
          facets={facets.categorical.bodyType ?? []}
          spec={spec}
          onChange={apply}
        />
      </Section>

      <Section title="Ethnicity" badge={countCategorical("ethnicity")}>
        <CategoricalControl
          field="ethnicity"
          facets={facets.categorical.ethnicity ?? []}
          spec={spec}
          onChange={apply}
        />
      </Section>

      <Section title="Status" badge={countCategorical("status")}>
        <CategoricalControl
          field="status"
          facets={facets.categorical.status ?? []}
          spec={spec}
          onChange={apply}
        />
      </Section>

      <Section
        title="Height"
        badge={spec.range.some((r) => r.field === "height") ? 1 : 0}
      >
        <RangeControl
          field="height"
          unit="cm"
          bounds={{ min: 140, max: 220 }}
          spec={spec}
          onChange={apply}
        />
      </Section>

      <Section
        title="Weight"
        badge={spec.range.some((r) => r.field === "weight") ? 1 : 0}
      >
        <RangeControl
          field="weight"
          unit="kg"
          bounds={{ min: 40, max: 150 }}
          spec={spec}
          onChange={apply}
        />
      </Section>

      <Section
        title="Age"
        badge={spec.range.some((r) => r.field === "age") ? 1 : 0}
      >
        <RangeControl
          field="age"
          unit="yrs"
          bounds={{ min: 18, max: 80 }}
          spec={spec}
          onChange={apply}
        />
      </Section>

      <Section
        title="Body marks"
        badge={
          countPresence("tattoo") +
          countPresence("scar") +
          countPresence("piercing") +
          countPresence("modification") +
          countPresence("procedure")
        }
        defaultOpen
      >
        <div className="space-y-2">
          <MarkControl
            field="tattoo"
            label="Tattoos"
            counts={facets.presence.tattoo}
            spec={spec}
            onChange={apply}
          />
          <MarkControl
            field="scar"
            label="Scars"
            counts={facets.presence.scar}
            spec={spec}
            onChange={apply}
          />
          <MarkControl
            field="piercing"
            label="Piercings"
            counts={facets.presence.piercing}
            spec={spec}
            onChange={apply}
          />
          <MarkControl
            field="modification"
            label="Body modifications"
            counts={facets.presence.modification}
            spec={spec}
            onChange={apply}
          />
          <MarkControl
            field="procedure"
            label="Cosmetic procedures"
            counts={facets.presence.procedure}
            spec={spec}
            onChange={apply}
          />
        </div>
      </Section>

      {attributeGroups.map((g) => (
        <Section
          key={g.groupName}
          title={g.groupName}
          badge={g.options.filter((o) => spec.attribute.some((a) => a.definitionId === o.definitionId)).length}
        >
          <div className="space-y-3">
            {g.options.map((opt) => (
              <AttributeControl
                key={opt.definitionId}
                option={opt}
                facets={facets.attribute?.[opt.definitionId]}
                spec={spec}
                onChange={apply}
              />
            ))}
          </div>
        </Section>
      ))}

      {!isEmptySpec(spec) && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-auto text-xs"
          onClick={() => apply({ ...EMPTY_SPEC, timeScope: spec.timeScope })}
        >
          Reset all filters
        </Button>
      )}
    </aside>
  );
}
