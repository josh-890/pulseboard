"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { TypedAttributeInput, type TypedAttributeDefinition } from "@/components/people/typed-attribute-input";
import { RemoveValueButton } from "@/components/people/remove-value-button";
import { recordPhysicalChangeAction } from "@/lib/actions/appearance-actions";
import { splitOptionLabel } from "@/lib/utils";

// In-place editor for an attribute that never changes (ADR-0005 ALWAYS_STATIC,
// built 2026-10-20). It writes the baseline — "always true" — and nothing else;
// an empty value clears it. A value recorded later as a change would still
// override the baseline, so the editor lists those with a way to remove them.

export type StaticAttributeOverride = {
  deltaId: string;
  value: string;
  /** The change it sits in, e.g. "Undated changes" */
  where: string;
};

export type StaticAttributeEditData = {
  personId: string;
  definition: TypedAttributeDefinition;
  baselineValue: string;
  baselineUnknown: boolean;
  overrides: StaticAttributeOverride[];
};

export type StaticAttributeEditorProps = StaticAttributeEditData & {
  /** The value the row shows — the start when the baseline is empty */
  currentValue: string;
  onClose: () => void;
};

export function StaticAttributeEditor({
  personId,
  definition,
  baselineValue,
  baselineUnknown,
  overrides,
  currentValue,
  onClose,
}: StaticAttributeEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(baselineValue || (baselineUnknown ? "" : currentValue));
  const [unknown, setUnknown] = useState(baselineUnknown);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    startTransition(async () => {
      setError(null);
      const result = await recordPhysicalChangeAction(personId, {
        intent: "baseline",
        attributes: [{ definitionId: definition.id, value: unknown ? "" : value.trim(), isVerifiedUnknown: unknown }],
      });
      if (!result.success) {
        setError(result.error ?? "Could not save.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="mt-1.5 space-y-2.5 rounded-lg border border-white/15 bg-background/60 p-2.5">
      <TypedAttributeInput
        definition={definition}
        value={value}
        onChange={setValue}
        isVerifiedUnknown={unknown}
        onVerifiedUnknownChange={setUnknown}
      />
      <p className="text-[11px] text-muted-foreground">
        Never changes — saved as always true (baseline). Empty it to clear.
      </p>

      {overrides.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-2" role="note">
          <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle size={12} aria-hidden="true" />
            {overrides.length === 1 ? "A later change overrides this:" : "Later changes override this:"}
          </p>
          {overrides.map((o) => (
            <div key={o.deltaId} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 text-foreground/80">
                {splitOptionLabel(o.value).label} <span className="text-muted-foreground">· {o.where}</span>
              </span>
              <RemoveValueButton
                deltaId={o.deltaId}
                personId={personId}
                what={`${definition.name}: ${splitOptionLabel(o.value).label}`}
                where={o.where}
                label="Remove"
                className="shrink-0 px-1.5"
              />
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

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
