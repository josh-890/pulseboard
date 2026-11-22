"use client";

import { useId, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposerCatalog } from "@/lib/composer";

export type ComposerTagPickerProps = {
  catalog: ComposerCatalog;
  label: string;
  /** Tags not to offer (already linked, the value itself) */
  exclude: Set<string>;
  onPick: (tagId: string) => void;
  disabled?: boolean;
  testId?: string;
};

const MAX = 8;

/** Find a Composer value by name (its facet beside it) and pick it — ↑ ↓ Enter, Esc clears */
export function ComposerTagPicker({ catalog, label, exclude, onPick, disabled, testId }: ComposerTagPickerProps) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const all = Object.values(catalog.tags).filter((t) => !exclude.has(t.id) && t.name.toLowerCase().includes(s));
    all.sort((a, b) => Number(!a.name.toLowerCase().startsWith(s)) - Number(!b.name.toLowerCase().startsWith(s)) || a.name.localeCompare(b.name));
    return all.slice(0, MAX);
  }, [q, catalog.tags, exclude]);

  const pick = (id: string) => {
    onPick(id);
    setQ("");
    setActive(0);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1 rounded-md border border-dashed border-border/70 bg-background/60 px-1.5 focus-within:ring-2 focus-within:ring-ring">
        <Plus size={12} aria-hidden className="shrink-0 text-muted-foreground" />
        <input
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={listId}
          aria-label={label}
          placeholder={label}
          value={q}
          disabled={disabled}
          data-testid={testId}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (hits[active]) pick(hits[active].id);
            } else if (e.key === "Escape") setQ("");
          }}
          className="min-w-0 flex-1 bg-transparent py-1 text-xs outline-none disabled:opacity-60"
        />
      </div>
      {hits.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border/60 bg-popover py-1 shadow-lg">
          {hits.map((t, i) => (
            <li key={t.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(t.id)}
                data-testid="composer-picker-hit"
                className={cn("flex w-full items-center gap-2 px-2 py-1 text-left text-xs", i === active ? "bg-muted" : "hover:bg-muted/60")}
              >
                <span className="truncate font-medium">{t.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{catalog.groups[t.groupId]?.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
