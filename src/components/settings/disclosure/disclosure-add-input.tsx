"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type DisclosureAddInputProps = {
  placeholder: string;
  label: string;
  onAdd: (name: string) => Promise<void>;
  className?: string;
};

// A one-line "add" field: Enter adds and keeps the field ready for the next one.
export function DisclosureAddInput({ placeholder, label, onAdd, className }: DisclosureAddInputProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const name = value.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onAdd(name);
      setValue("");
    } catch {
      // the toast already said why; keep the text
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        disabled={busy}
        className="h-8 min-w-0 flex-1 rounded-md border border-white/15 bg-muted/30 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy || !value.trim()}
        aria-label={label}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/15 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
