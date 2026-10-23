"use client";

import { useEffect, useRef, useState } from "react";
import { isIntensityStep, INTENSITY_STEP } from "@/lib/intensity";
import { cn } from "@/lib/utils";

/** How long a value must rest before it is saved — arrow keys step freely until then */
const SAVE_AFTER_MS = 700;

export type IntensityStepInputProps = {
  value: number;
  label: string;
  /** Shown before the number, e.g. "+" for an extra's points */
  prefix?: string;
  onCommit: (value: number) => Promise<void>;
  /** The highest value the field offers (an act's level: the cap below Max) */
  max?: number;
  /** Focus the field when it mounts — an act that moved to another row keeps its cursor */
  autoFocus?: boolean;
  className?: string;
};

// A number in 0.5 steps, saved once it rests for a moment, or on blur or Enter;
// Escape puts the old value back. The key resets the field when the saved
// value changes underneath it. The field never disables itself while saving,
// so focus — and stepping with the arrow keys — carries on.
export function IntensityStepInput({ value, label, prefix, onCommit, max, autoFocus, className }: IntensityStepInputProps) {
  const [text, setText] = useState(String(value));
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** The last value sent, so Enter followed by blur saves once */
  const sent = useRef(value);
  /** Escape blurs without saving */
  const cancelled = useRef(false);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [autoFocus]);

  function parse(t: string): number | null {
    const n = Number(t.replace(",", "."));
    return t.trim() !== "" && isIntensityStep(n) ? n : null;
  }

  const invalid = parse(text) === null;

  async function commit(t: string, restoreIfInvalid: boolean) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = parse(t);
    if (next === null) {
      if (restoreIfInvalid) setText(String(value));
      return;
    }
    if (next === sent.current) return;
    sent.current = next;
    setBusy(true);
    try {
      await onCommit(next);
    } catch {
      sent.current = value;
      setText(String(value));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5", className)}>
      {prefix && <span className="text-xs text-muted-foreground" aria-hidden="true">{prefix}</span>}
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        min={0}
        max={max}
        step={INTENSITY_STEP}
        value={text}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-busy={busy || undefined}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(t, false), SAVE_AFTER_MS);
        }}
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false;
            return;
          }
          commit(text, true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(text, true);
          if (e.key === "Escape") {
            if (timer.current) clearTimeout(timer.current);
            cancelled.current = true;
            setText(String(value));
            e.currentTarget.blur();
          }
        }}
        className="h-7 w-14 rounded-md border border-white/15 bg-muted/30 px-1.5 text-right text-sm font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-ring aria-[busy]:opacity-60 aria-[invalid]:border-destructive"
      />
    </span>
  );
}
