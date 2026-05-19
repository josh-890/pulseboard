"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PhysicalAttributeValueType } from "@/generated/prisma/client";

export type TypedAttributeDefinition = {
  id: string;
  name: string;
  unit: string | null;
  valueType: PhysicalAttributeValueType;
  allowedValues: string[];
  ordinalMin: number | null;
  ordinalMax: number | null;
};

type Props = {
  definition: TypedAttributeDefinition;
  value: string;       // raw stored string; "" = absent
  onChange: (next: string) => void;
  className?: string;
};

// Multi-select storage encoding — pipe-joined since values can contain commas
const MULTI_DELIM = "|";

function parseMulti(v: string): string[] {
  if (!v) return [];
  return v.split(MULTI_DELIM).map((s) => s.trim()).filter(Boolean);
}

function encodeMulti(values: string[]): string {
  return values.join(MULTI_DELIM);
}

export function TypedAttributeInput({ definition, value, onChange, className }: Props) {
  switch (definition.valueType) {
    case "BOOLEAN": {
      const checked = value === "yes";
      return (
        <label className={cn("flex items-center gap-2 text-sm", className)}>
          <Checkbox
            checked={checked}
            onCheckedChange={(c) => onChange(c ? "yes" : "")}
          />
          <span>{definition.name}</span>
        </label>
      );
    }

    case "SINGLE_SELECT":
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-9 w-full rounded-md border border-white/15 bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring",
            className,
          )}
        >
          <option value="">—</option>
          {definition.allowedValues.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      );

    case "MULTI_SELECT": {
      const selected = new Set(parseMulti(value));
      const toggle = (v: string) => {
        const next = new Set(selected);
        if (next.has(v)) next.delete(v);
        else next.add(v);
        onChange(encodeMulti(Array.from(next)));
      };
      return (
        <div className={cn("space-y-1", className)}>
          {definition.allowedValues.map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <Checkbox checked={selected.has(v)} onCheckedChange={() => toggle(v)} />
              <span>{v}</span>
            </label>
          ))}
        </div>
      );
    }

    case "ORDINAL": {
      const min = definition.ordinalMin ?? 1;
      const max = definition.ordinalMax ?? 5;
      const current = value === "" ? null : Number(value);
      return (
        <div className={cn("flex items-center gap-2", className)}>
          <input
            type="range"
            min={min}
            max={max}
            value={current ?? min}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1"
          />
          <span className="w-12 text-right text-sm tabular-nums">
            {current ?? "—"} / {max}
          </span>
          {current != null && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              clear
            </button>
          )}
        </div>
      );
    }

    case "NUMERIC":
      return (
        <div className={cn("flex items-center gap-2", className)}>
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            step="any"
            className="h-9 flex-1 text-sm"
          />
          {definition.unit && (
            <span className="text-xs text-muted-foreground">{definition.unit}</span>
          )}
        </div>
      );

    case "TEXT":
    default:
      return (
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("h-9 text-sm", className)}
        />
      );
  }
}
