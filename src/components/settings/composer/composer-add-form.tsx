"use client";

import { useId, useState, type ReactNode } from "react";
import { Loader2, Plus } from "lucide-react";

export type ComposerAddFormProps = {
  label: string;
  placeholder: string;
  hint?: string;
  /** Resolves true when it was added (the field clears), false to keep the text */
  onAdd: (name: string) => Promise<boolean>;
  /** Further choices beside the field (e.g. one / many) */
  extra?: ReactNode;
  testId?: string;
};

/** "Add a …": a name and a button; Enter adds */
export function ComposerAddForm({ label, placeholder, hint, onAdd, extra, testId }: ComposerAddFormProps) {
  const id = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-1"
      data-testid={testId}
      onSubmit={async (e) => {
        e.preventDefault();
        const n = name.trim();
        if (!n) return;
        setBusy(true);
        const ok = await onAdd(n);
        setBusy(false);
        if (ok) setName("");
      }}
    >
      <label htmlFor={id} className="text-xs font-semibold">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          disabled={busy}
          className="min-w-0 flex-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        {extra}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Plus size={13} aria-hidden />} Add
        </button>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </form>
  );
}
