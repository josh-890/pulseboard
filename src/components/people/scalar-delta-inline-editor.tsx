"use client";

import { useCallback, useState, useTransition } from "react";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { TypedAttributeInput } from "@/components/people/typed-attribute-input";
import { editScalarDeltaAction } from "@/lib/actions/appearance-actions";

// Phase G Slice 9 / ADR-0006: inline editor for a single ScalarDelta.
// Lives within the Undated drawer and (in the future) any timeline row that
// wants per-delta editing. Reuses Slice 8's sticky-only-for-curated routing
// at delta granularity via editScalarDeltaAction.

type DeltaForEdit = {
  id: string;
  value: string;
  date: Date | null;
  datePrecision: string;
  cause: "NATURAL" | "SURGICAL" | "OTHER";
  attributeDefinition: {
    id: string;
    name: string;
    unit: string | null;
    valueType: "TEXT" | "NUMERIC" | "SINGLE_SELECT" | "MULTI_SELECT" | "BOOLEAN" | "ORDINAL";
    allowedValues: string[];
    ordinalMin: number | null;
    ordinalMax: number | null;
    statusBearing: boolean;
  };
};

type Props = {
  delta: DeltaForEdit;
  personId: string;
  initialIntent: "on-date" | "dateless" | "baseline";
  onClose: () => void;
  onSaved?: () => void;
};

export function ScalarDeltaInlineEditor({ delta, personId, initialIntent, onClose, onSaved }: Props) {
  const [isPending, startTransition] = useTransition();
  const [intent, setIntent] = useState<"on-date" | "dateless" | "baseline">(initialIntent);
  const [value, setValue] = useState(delta.value);
  const initDate = delta.date
    ? new Date(delta.date).toISOString().slice(0, 10)
    : "";
  const [date, setDate] = useState(initDate);
  const [datePrecision, setDatePrecision] = useState(delta.datePrecision ?? "UNKNOWN");
  const [cause, setCause] = useState<"NATURAL" | "SURGICAL" | "OTHER">(delta.cause);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(() => {
    if (!value.trim()) {
      setError("Value can't be empty. Delete the row to remove it.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await editScalarDeltaAction(delta.id, personId, {
        value,
        intent,
        date: intent === "on-date" ? (date || null) : null,
        datePrecision: intent === "on-date" ? datePrecision : "UNKNOWN",
        cause: delta.attributeDefinition.statusBearing ? cause : undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to save.");
        return;
      }
      onSaved?.();
      onClose();
    });
  }, [delta.id, delta.attributeDefinition.statusBearing, personId, intent, date, datePrecision, cause, value, onClose, onSaved]);

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {delta.attributeDefinition.name}
          {delta.attributeDefinition.unit ? ` (${delta.attributeDefinition.unit})` : ""}
        </label>
        <TypedAttributeInput
          definition={delta.attributeDefinition}
          value={value}
          onChange={setValue}
        />
      </div>

      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs font-medium text-muted-foreground">When did this change?</legend>
        <label className="flex items-start gap-2 cursor-pointer text-sm">
          <input
            type="radio"
            name={`intent-${delta.id}`}
            value="on-date"
            checked={intent === "on-date"}
            onChange={() => setIntent("on-date")}
            className="mt-1 cursor-pointer"
          />
          <div className="flex-1 space-y-1">
            <span>On this date</span>
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
        <label className="flex items-start gap-2 cursor-pointer text-sm">
          <input
            type="radio"
            name={`intent-${delta.id}`}
            value="dateless"
            checked={intent === "dateless"}
            onChange={() => setIntent("dateless")}
            className="mt-1 cursor-pointer"
          />
          <span>I don&apos;t know when yet</span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer text-sm">
          <input
            type="radio"
            name={`intent-${delta.id}`}
            value="baseline"
            checked={intent === "baseline"}
            onChange={() => setIntent("baseline")}
            className="mt-1 cursor-pointer"
          />
          <span>Always was true (baseline)</span>
        </label>
      </fieldset>

      {delta.attributeDefinition.statusBearing && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Cause</label>
          <select
            value={cause}
            onChange={(e) => setCause(e.target.value as "NATURAL" | "SURGICAL" | "OTHER")}
            className="w-full rounded-lg border border-white/15 bg-muted/30 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="NATURAL">Natural</option>
            <option value="SURGICAL">Surgical</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
