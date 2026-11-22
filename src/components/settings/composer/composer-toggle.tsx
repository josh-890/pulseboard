"use client";

import { cn } from "@/lib/utils";

export type ComposerToggleProps = {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  testId?: string;
};

/** An on/off setting with its explanation — a plain switch button (no hidden form input) */
export function ComposerToggle({ label, hint, checked, onChange, disabled, testId }: ComposerToggleProps) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
          checked ? "bg-primary" : "bg-input dark:bg-input/80",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "block h-4 w-4 rounded-full bg-background shadow-sm transition-transform duration-150 motion-reduce:transition-none",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </div>
  );
}
