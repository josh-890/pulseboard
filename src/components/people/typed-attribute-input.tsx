"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, splitOptionLabel } from "@/lib/utils";
import type { PhysicalAttributeValueType } from "@/generated/prisma/client";

export type TypedAttributeDefinition = {
  id: string;
  name: string;
  slug: string;
  unit: string | null;
  valueType: PhysicalAttributeValueType;
  allowedValues: string[];
  ordinalMin: number | null;
  ordinalMax: number | null;
  // Slice 16 follow-up: drives the inline "Don't know" affordance —
  // only rendered for TIER_1 attributes.
  tier?: "TIER_1" | "TIER_2" | "NONE";
};

type Props = {
  definition: TypedAttributeDefinition;
  value: string;       // raw stored string; "" = absent
  onChange: (next: string) => void;
  // Slice 16 follow-up: verified-unknown affordance. When isVerifiedUnknown
  // is true the input collapses to a muted "Marked unknown" state with a
  // "Clear" toggle; otherwise the normal input renders with a small
  // "Don't know" link next to it (Tier 1 only).
  isVerifiedUnknown?: boolean;
  onVerifiedUnknownChange?: (next: boolean) => void;
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

export function TypedAttributeInput({
  definition,
  value,
  onChange,
  isVerifiedUnknown,
  onVerifiedUnknownChange,
  className,
}: Props) {
  // Slice 16 follow-up: verified-unknown affordance — Tier 1 only, and
  // only when the parent passed a setter (caller decides whether to wire
  // it; today only the record/edit physical-change sheets do).
  const tierOneAffordance =
    definition.tier === "TIER_1" && onVerifiedUnknownChange != null;

  // Muted "Marked unknown" collapsed state.
  if (tierOneAffordance && isVerifiedUnknown) {
    return (
      <div className={cn("flex items-center gap-2 text-sm", className)}>
        <span className="italic text-muted-foreground/70">Marked unknown</span>
        <button
          type="button"
          onClick={() => onVerifiedUnknownChange?.(false)}
          className="text-[10px] text-muted-foreground hover:text-foreground underline"
        >
          clear
        </button>
      </div>
    );
  }

  const inputEl = renderInputBody({ definition, value, onChange, className });

  if (!tierOneAffordance) return inputEl;

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">{inputEl}</div>
      <button
        type="button"
        onClick={() => {
          onChange("");
          onVerifiedUnknownChange?.(true);
        }}
        className="mt-1.5 whitespace-nowrap text-[10px] text-muted-foreground hover:text-foreground underline"
      >
        don&apos;t know
      </button>
    </div>
  );
}

function renderInputBody({
  definition,
  value,
  onChange,
  className,
}: {
  definition: TypedAttributeDefinition;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
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

    case "SINGLE_SELECT": {
      const parsedOptions = definition.allowedValues.map((v) => ({
        value: v,
        ...splitOptionLabel(v),
      }));
      const anyHelper = parsedOptions.some((o) => o.helper !== null);
      const currentLabel = value === "" ? null : splitOptionLabel(value).label;
      return (
        <div className={cn("flex items-center gap-1.5", className)}>
          <Select
            value={value === "" ? undefined : value}
            onValueChange={(v) => onChange(v)}
          >
            <SelectTrigger className="h-9 flex-1 text-sm">
              <SelectValue placeholder="—">{currentLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {parsedOptions.map((o) => (
                <SelectItem key={o.value} value={o.value} className="py-2">
                  <div className="flex flex-col items-start">
                    <span>{o.label}</span>
                    {o.helper && (
                      <span className="text-xs text-muted-foreground">{o.helper}</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {anyHelper && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  aria-label={`${definition.name} — option reference`}
                >
                  <HelpCircle size={14} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {definition.name} options
                </div>
                <dl className="space-y-1.5 text-sm">
                  {parsedOptions.map((o) => (
                    <div key={o.value} className="grid grid-cols-[1fr_1.4fr] gap-3">
                      <dt className="font-medium">{o.label}</dt>
                      <dd className="text-xs text-muted-foreground">
                        {o.helper ?? "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </PopoverContent>
            </Popover>
          )}
        </div>
      );
    }

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
      return <NumericInput definition={definition} value={value} onChange={onChange} className={className} />;

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

// ADR-0008 / Phase G Slice 16D Step 4: NUMERIC input with an optional inches
// sibling when the canonical unit is cm. cm stays the stored value; the
// inches field is a view + alternate authoring path for US-formatted body
// measurements (e.g. "34-23-35").
//
// Each input owns a local draft string while focused so the derived re-format
// can't clobber what the user is mid-type. On blur the draft is dropped and
// the view re-derives from the canonical cm value.
function NumericInput({
  definition,
  value,
  onChange,
  className,
}: {
  definition: TypedAttributeDefinition;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  // Height has its own dedicated edit affordance, and US convention for
  // height is ft′in″ not raw inches — show 165 cm ≈ 65 in is technically
  // correct but misleading. Skip the sibling for height; body measurements
  // (Bust/Waist/Hips/Inseam/...) keep it.
  const showInches = definition.unit === "cm" && definition.slug !== "height";
  const cmNumber = value === "" ? null : Number(value);
  const inchesView =
    cmNumber != null && Number.isFinite(cmNumber)
      ? (cmNumber / 2.54).toFixed(1)
      : "";

  const [cmFocused, setCmFocused] = useState(false);
  const [cmDraft, setCmDraft] = useState("");
  const [inFocused, setInFocused] = useState(false);
  const [inDraft, setInDraft] = useState("");

  const cmDisplay = cmFocused ? cmDraft : value;
  const inDisplay = inFocused ? inDraft : inchesView;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Input
        type="number"
        value={cmDisplay}
        onFocus={() => {
          setCmDraft(value);
          setCmFocused(true);
        }}
        onBlur={() => setCmFocused(false)}
        onChange={(e) => {
          setCmDraft(e.target.value);
          onChange(e.target.value);
        }}
        step="any"
        className="h-9 flex-1 text-sm"
      />
      {definition.unit && (
        <span className="text-xs text-muted-foreground">{definition.unit}</span>
      )}
      {showInches && (
        <>
          <span className="text-xs text-muted-foreground">≈</span>
          <Input
            type="number"
            value={inDisplay}
            onFocus={() => {
              setInDraft(inchesView);
              setInFocused(true);
            }}
            onBlur={() => setInFocused(false)}
            onChange={(e) => {
              const raw = e.target.value;
              setInDraft(raw);
              if (raw === "") {
                onChange("");
                return;
              }
              const n = Number(raw);
              if (Number.isFinite(n)) onChange(String(n * 2.54));
            }}
            step="any"
            className="h-9 w-20 text-sm"
            aria-label={`${definition.name} in inches`}
          />
          <span className="text-xs text-muted-foreground">in</span>
        </>
      )}
    </div>
  );
}
