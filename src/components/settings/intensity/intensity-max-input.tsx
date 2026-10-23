"use client";

import { useState } from "react";
import { setIntensityMaxAction } from "@/lib/actions/intensity-catalog-actions";
import { INTENSITY_MAX_RANGE } from "@/lib/intensity";
import { useCatalogCall } from "./use-catalog-call";

export type IntensityMaxInputProps = {
  max: number;
};

// The top of the scale (2026-10-23): a whole number; the cap follows half a
// step below. Saved on Enter or when the field is left; Esc puts it back. A
// lower Max is refused while acts or described values sit above it — the
// toast names them.
export function IntensityMaxInput({ max }: IntensityMaxInputProps) {
  const { call } = useCatalogCall();
  const [text, setText] = useState(String(max));
  const [seen, setSeen] = useState(max);
  if (seen !== max) {
    setSeen(max);
    setText(String(max));
  }

  async function commit() {
    const n = Number(text);
    if (text.trim() === "" || n === max) return setText(String(max));
    await call(() => setIntensityMaxAction(n)).catch(() => setText(String(max)));
  }

  return (
    <label className="text-muted-foreground flex items-center gap-2 text-xs">
      Max
      <input
        type="number"
        inputMode="numeric"
        min={INTENSITY_MAX_RANGE.min}
        max={INTENSITY_MAX_RANGE.max}
        step={1}
        value={text}
        aria-label="Top of the scale (Max)"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(String(max));
            e.preventDefault();
          }
        }}
        className="bg-muted/30 text-foreground focus:ring-ring h-7 w-14 rounded-md border border-white/15 px-1.5 text-right text-sm font-semibold tabular-nums focus:ring-1 focus:outline-none"
      />
    </label>
  );
}
