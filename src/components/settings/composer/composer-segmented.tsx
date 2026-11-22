"use client";

import { cn } from "@/lib/utils";

export type ComposerSegmentedProps<T extends string> = {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  testId?: string;
};

/** A fixed pill segment (no layout shift): one of a few values, keyboard-reachable */
export function ComposerSegmented<T extends string>({ label, value, options, onChange, disabled, testId }: ComposerSegmentedProps<T>) {
  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <div role="radiogroup" aria-label={label} data-testid={testId} className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              title={o.hint}
              onClick={() => !on && onChange(o.value)}
              data-value={o.value}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
