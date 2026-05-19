"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhysicalAttributeValueType } from "@/generated/prisma/client";

export type DefinitionFormValue = {
  name: string;
  unit: string | null;
  valueType: PhysicalAttributeValueType;
  allowedValues: string[];
  ordinalMin: number | null;
  ordinalMax: number | null;
};

type Props = {
  initial?: Partial<DefinitionFormValue>;
  onCancel: () => void;
  onSubmit: (value: DefinitionFormValue) => void;
  submitLabel?: string;
  busy?: boolean;
};

const TYPE_OPTIONS: { value: PhysicalAttributeValueType; label: string; hint: string }[] = [
  { value: "BOOLEAN",       label: "Boolean",         hint: "yes / absent (single checkbox)" },
  { value: "SINGLE_SELECT", label: "Single-select",   hint: "pick one of the allowed values" },
  { value: "MULTI_SELECT",  label: "Multi-select",    hint: "pick any combination of the allowed values" },
  { value: "ORDINAL",       label: "Ordinal scale",   hint: "integer between min and max" },
  { value: "NUMERIC",       label: "Numeric",         hint: "number, optionally with a unit (kg, cm, %)" },
  { value: "TEXT",          label: "Text (freeform)", hint: "freetext, no search facet" },
];

export function PhysicalAttributeDefinitionForm({
  initial,
  onCancel,
  onSubmit,
  submitLabel = "Save",
  busy,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [valueType, setValueType] = useState<PhysicalAttributeValueType>(
    initial?.valueType ?? "TEXT",
  );
  const [allowedValues, setAllowedValues] = useState<string[]>(
    initial?.allowedValues ?? [],
  );
  const [newValue, setNewValue] = useState("");
  const [ordinalMin, setOrdinalMin] = useState<string>(
    initial?.ordinalMin != null ? String(initial.ordinalMin) : "1",
  );
  const [ordinalMax, setOrdinalMax] = useState<string>(
    initial?.ordinalMax != null ? String(initial.ordinalMax) : "5",
  );
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [error, setError] = useState<string | null>(null);

  const addAllowedValue = () => {
    const v = newValue.trim();
    if (!v) return;
    if (allowedValues.includes(v)) {
      setNewValue("");
      return;
    }
    setAllowedValues((p) => [...p, v]);
    setNewValue("");
  };

  const removeAllowedValue = (v: string) => {
    setAllowedValues((p) => p.filter((x) => x !== v));
  };

  const handleSubmit = () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (
      (valueType === "SINGLE_SELECT" || valueType === "MULTI_SELECT") &&
      allowedValues.length === 0
    ) {
      setError("Select types need at least one allowed value");
      return;
    }
    if (valueType === "ORDINAL") {
      const min = Number(ordinalMin);
      const max = Number(ordinalMax);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
        setError("Ordinal min must be less than max");
        return;
      }
    }

    onSubmit({
      name: name.trim(),
      unit: valueType === "NUMERIC" && unit.trim() ? unit.trim() : null,
      valueType,
      allowedValues:
        valueType === "SINGLE_SELECT" || valueType === "MULTI_SELECT"
          ? allowedValues
          : [],
      ordinalMin: valueType === "ORDINAL" ? Number(ordinalMin) : null,
      ordinalMax: valueType === "ORDINAL" ? Number(ordinalMax) : null,
    });
  };

  const typeOpt = TYPE_OPTIONS.find((o) => o.value === valueType);

  return (
    <div className="space-y-2 rounded-lg border border-white/15 bg-background/40 p-3">
      {/* Name */}
      <div>
        <label className="text-[10px] text-muted-foreground">Attribute name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Freckle Intensity"
          className="mt-0.5 w-full rounded-md border border-white/15 bg-background/50 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
      </div>

      {/* Type */}
      <div>
        <label className="text-[10px] text-muted-foreground">Type</label>
        <select
          value={valueType}
          onChange={(e) => setValueType(e.target.value as PhysicalAttributeValueType)}
          className="mt-0.5 w-full rounded-md border border-white/15 bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {typeOpt && (
          <p className="mt-0.5 text-[10px] text-muted-foreground/70">{typeOpt.hint}</p>
        )}
      </div>

      {/* Per-type editors */}
      {(valueType === "SINGLE_SELECT" || valueType === "MULTI_SELECT") && (
        <div>
          <label className="text-[10px] text-muted-foreground">Allowed values</label>
          <div className="mt-0.5 space-y-1">
            {allowedValues.length === 0 && (
              <p className="text-[11px] text-muted-foreground/60 italic">
                No values yet — add at least one below
              </p>
            )}
            {allowedValues.map((v) => (
              <div
                key={v}
                className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1 text-xs"
              >
                <span>{v}</span>
                <button
                  type="button"
                  onClick={() => removeAllowedValue(v)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${v}`}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            <div className="flex gap-1">
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addAllowedValue(); }
                }}
                placeholder="Add value…"
                className="flex-1 rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={addAllowedValue}
                className="rounded-md bg-primary/15 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/25"
              >
                <Plus size={11} />
              </button>
            </div>
          </div>
        </div>
      )}

      {valueType === "ORDINAL" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Min</label>
            <input
              type="number"
              value={ordinalMin}
              onChange={(e) => setOrdinalMin(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-white/15 bg-background/50 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Max</label>
            <input
              type="number"
              value={ordinalMax}
              onChange={(e) => setOrdinalMax(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-white/15 bg-background/50 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {valueType === "NUMERIC" && (
        <div>
          <label className="text-[10px] text-muted-foreground">
            Unit (optional, e.g. kg, cm, %)
          </label>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="(none)"
            className="mt-0.5 w-full rounded-md border border-white/15 bg-background/50 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      <div className="flex justify-end gap-1 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className={cn(
            "rounded-md bg-primary/20 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/30",
            busy && "opacity-50",
          )}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
