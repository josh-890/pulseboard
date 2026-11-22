"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type ComposerTextFieldProps = {
  label: string;
  value: string;
  /** Called with the trimmed text when it changed — on Enter (single line) or leaving the field */
  onSave: (text: string) => Promise<void>;
  multiline?: boolean;
  placeholder?: string;
  /** An empty text is refused (names) */
  required?: boolean;
  testId?: string;
};

/**
 * A field that saves itself (Settings → Composer): Enter or leaving saves, Esc
 * puts the text back. A failed save keeps the typed text for another try.
 */
export function ComposerTextField({ label, value, onSave, multiline, placeholder, required, testId }: ComposerTextFieldProps) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const [saving, setSaving] = useState(false);
  // A new value from the server (another node, a refresh) replaces the text
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }

  const save = async () => {
    const next = text.trim();
    if (next === value.trim()) return;
    if (required && !next) {
      setText(value);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } catch {
      // kept for another try; the caller toasted the reason
    } finally {
      setSaving(false);
    }
  };

  const common = {
    "aria-label": label,
    "data-testid": testId,
    value: text,
    placeholder,
    disabled: saving,
    onBlur: () => void save(),
    className: cn(
      "w-full rounded-md border border-border/60 bg-background/60 px-2 py-1 text-sm transition-colors duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
    ),
  };

  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          {...common}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setText(value);
          }}
        />
      ) : (
        <input
          {...common}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setText(value);
          }}
        />
      )}
    </label>
  );
}
