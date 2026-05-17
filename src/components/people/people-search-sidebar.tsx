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
import { Label } from "@/components/ui/label";
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
import { getAllFamilies, type ColorCategory } from "@/lib/constants/color-families";

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
          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
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
  colorCategory,
  spec,
  onChange,
}: {
  field: string;
  facets: FacetOption[];
  colorCategory?: ColorCategory;
  spec: FilterSpec;
  onChange: (next: FilterSpec) => void;
}) {
  const current = spec.categorical.find((c) => c.field === field);
  const selected = new Set(current?.values ?? []);
  const mode = current?.mode ?? "exact";

  const families = colorCategory ? getAllFamilies(colorCategory) : [];
  const options = mode === "family" && colorCategory
    ? families.map((f) => ({ value: f, count: 0 }))
    : facets;

  const update = (nextValues: string[], nextMode: "exact" | "family" = mode) => {
    const others = spec.categorical.filter((c) => c.field !== field);
    if (nextValues.length === 0) {
      onChange({ ...spec, categorical: others });
    } else {
      const next: CategoricalFilter = { field, values: nextValues, mode: nextMode };
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
      {colorCategory && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <button
            type="button"
            onClick={() => update([...selected], "exact")}
            className={cn("rounded px-1.5 py-0.5", mode === "exact" ? "bg-amber-500/20 text-amber-300" : "hover:bg-white/5")}
          >
            exact
          </button>
          <button
            type="button"
            onClick={() => update([...selected], "family")}
            className={cn("rounded px-1.5 py-0.5", mode === "family" ? "bg-amber-500/20 text-amber-300" : "hover:bg-white/5")}
          >
            family
          </button>
        </div>
      )}
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
            {opt.count > 0 && (
              <span className="text-[10px] text-muted-foreground/60">{opt.count}</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Presence filter (tri-state) ─────────────────────────────────────────────

function PresenceControl({
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
  const current = spec.presence.find((p) => p.field === field);
  const state = current?.state ?? "any";

  const update = (next: PresenceFilter["state"]) => {
    const others = spec.presence.filter((p) => p.field !== field);
    if (next === "any") {
      onChange({ ...spec, presence: others });
    } else {
      onChange({ ...spec, presence: [...others, { field, state: next }] });
    }
  };

  const Pill = ({ value, text }: { value: PresenceFilter["state"]; text: string }) => (
    <button
      type="button"
      onClick={() => update(value)}
      className={cn(
        "flex-1 rounded px-2 py-1 text-[11px]",
        state === value ? "bg-amber-500/20 text-amber-300" : "bg-white/5 hover:bg-white/10",
      )}
    >
      {text}
    </button>
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span>{label}</span>
        {counts && state === "any" && (
          <span className="text-[10px] text-muted-foreground/60">
            {counts.has} / {counts.hasnt}
          </span>
        )}
      </div>
      <div className="flex gap-1">
        <Pill value="has" text="has" />
        <Pill value="any" text="any" />
        <Pill value="hasnt" text="hasn't" />
      </div>
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
          className="group inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-amber-500/20"
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
          scope === "current" ? "bg-amber-500/20 text-amber-300" : "text-muted-foreground hover:text-foreground",
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
          scope === "ever" ? "bg-amber-500/20 text-amber-300" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Ever
      </button>
    </div>
  );
}

// ─── Main sidebar ────────────────────────────────────────────────────────────

export type PeopleSearchSidebarProps = {
  facets: {
    categorical: Record<string, FacetOption[]>;
    presence: Record<string, { has: number; hasnt: number }>;
  };
};

export function PeopleSearchSidebar({ facets }: PeopleSearchSidebarProps) {
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
        <Sparkles size={14} className="text-amber-400" />
      </div>

      <TimeScopeToggle
        scope={spec.timeScope}
        onChange={(next) => apply({ ...spec, timeScope: next })}
        disabled
      />

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
        title="Hair color"
        badge={countCategorical("hairColor") + countCategorical("naturalHairColor")}
        defaultOpen
      >
        <CategoricalControl
          field="hairColor"
          facets={facets.categorical.hairColor ?? []}
          colorCategory="hair"
          spec={spec}
          onChange={apply}
        />
      </Section>

      <Section title="Eye color" badge={countCategorical("eyeColor")}>
        <CategoricalControl
          field="eyeColor"
          facets={facets.categorical.eyeColor ?? []}
          colorCategory="eye"
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
          <PresenceControl
            field="tattoo"
            label="Tattoos"
            counts={facets.presence.tattoo}
            spec={spec}
            onChange={apply}
          />
          <PresenceControl
            field="scar"
            label="Scars"
            counts={facets.presence.scar}
            spec={spec}
            onChange={apply}
          />
          <PresenceControl
            field="piercing"
            label="Piercings"
            counts={facets.presence.piercing}
            spec={spec}
            onChange={apply}
          />
          <PresenceControl
            field="modification"
            label="Body modifications"
            counts={facets.presence.modification}
            spec={spec}
            onChange={apply}
          />
          <PresenceControl
            field="procedure"
            label="Cosmetic procedures"
            counts={facets.presence.procedure}
            spec={spec}
            onChange={apply}
          />
        </div>
      </Section>

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
