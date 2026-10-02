"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CornerDownLeft, TextSearch } from "lucide-react";
import type { TagFacetGroup } from "@/lib/services/tag-filter-service";
import type { TaggableEntity } from "@/lib/tag-domains";
import { applyCompletion, completionsFor, tokenAtCaret, type Completion } from "@/lib/tag-query";
import { cn } from "@/lib/utils";

export type TagQueryBoxProps = {
  /** The applied query text (from the URL) */
  value: string;
  onSubmit: (text: string) => void;
  facets: TagFacetGroup[];
  entityType: TaggableEntity;
};

// The text form of the tag filter (ADR-0033, S5). Shows the applied query —
// the chips and the facet panel edit the same text — and applies on Enter.
// Suggestions follow the token at the caret: groups (`location:`), tags
// (`location:beach`), levels (`@session:`), predicates (`is:fav`, `rating>=`).
// ↑/↓ choose, Tab or Enter take a suggestion, Esc drops the draft.
export function TagQueryBox({ value, onSubmit, facets, entityType }: TagQueryBoxProps) {
  // The draft follows the applied value until the user types (keyed reset below)
  const [draft, setDraft] = useState(value);
  const [appliedSeen, setAppliedSeen] = useState(value);
  const [caret, setCaret] = useState(value.length);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // A chip or the panel changed the applied query: show it
  if (appliedSeen !== value) {
    setAppliedSeen(value);
    setDraft(value);
    setCaret(value.length);
  }

  const groups = useMemo(
    () => facets.map((g) => ({ slug: g.slug, name: g.name, color: g.color, tags: g.tags.map((t) => ({ slug: t.slug, name: t.name })) })),
    [facets],
  );
  const token = useMemo(() => tokenAtCaret(draft, caret), [draft, caret]);
  const suggestions = useMemo(
    () => (focused ? completionsFor(token.core, token.prefix, groups, entityType) : []),
    [focused, token, groups, entityType],
  );
  const open = suggestions.length > 0;
  const dirty = draft.trim() !== value.trim();

  const take = (c: Completion) => {
    const next = applyCompletion(draft, token, c);
    setDraft(next.text);
    setCaret(next.caret);
    setActive(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
    } else if (open && e.key === "Tab") {
      e.preventDefault();
      take(suggestions[active] ?? suggestions[0]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      // A highlighted suggestion for an unfinished word wins over applying
      if (open && token.core && suggestions[active]) take(suggestions[active]);
      else onSubmit(draft.trim());
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(value);
      setCaret(value.length);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative min-w-[12rem] flex-1 sm:max-w-md">
      <div
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg border bg-muted/40 px-2 transition-colors duration-150",
          focused ? "border-primary/40 ring-1 ring-ring" : "border-white/15",
        )}
      >
        <TextSearch size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setActive(0);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? draft.length)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder="beach -studio is:fav …"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent font-mono text-xs placeholder:font-sans placeholder:text-muted-foreground focus:outline-none"
          aria-label="Tag query"
          role="combobox"
          aria-expanded={open}
          aria-controls="tag-query-suggestions"
          aria-autocomplete="list"
        />
        {dirty && (
          <button
            type="button"
            onClick={() => onSubmit(draft.trim())}
            className="inline-flex items-center gap-0.5 rounded px-1 text-[10px] text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Apply query"
          >
            <CornerDownLeft size={11} aria-hidden="true" /> apply
          </button>
        )}
      </div>
      {open && (
        <ul
          id="tag-query-suggestions"
          role="listbox"
          className="absolute left-0 top-9 z-50 w-full min-w-[16rem] overflow-hidden rounded-lg border border-white/15 bg-popover py-1 shadow-xl"
        >
          {suggestions.map((s, i) => (
            <li key={s.insert} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  take(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1 text-left text-xs",
                  i === active ? "bg-muted/60" : "hover:bg-muted/40",
                )}
              >
                {s.color ? (
                  <span className="inline-block size-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                ) : (
                  <span className="inline-block size-1.5 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{s.label}</span>
                {s.hint && <span className="ml-auto truncate pl-2 text-[10px] text-muted-foreground">{s.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
