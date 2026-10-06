"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { findTagNameClashesAction } from "@/lib/actions/tag-actions";
import { qualifiedTagName, toTagName, type TagNameClash } from "@/lib/tag-names";
import { cn } from "@/lib/utils";

export type TagNameClashHintProps = {
  /** The name being typed */
  name: string;
  /** Group the tag is in (or goes to) — names the suggested alternative */
  groupName: string;
  /** The tag being renamed (it does not clash with itself) */
  excludeId?: string;
  /** Take the suggested, unambiguous name */
  onUseSuggestion?: (name: string) => void;
  className?: string;
};

// The naming guide's soft guard: a tag name should be unique across the
// catalogue. Shown while creating or renaming when the name is already a tag
// (or an alias) elsewhere, with a one-click qualified alternative. Creating
// anyway stays possible — two groups may share a name.
export function TagNameClashHint({ name, groupName, excludeId, onUseSuggestion, className }: TagNameClashHintProps) {
  const [result, setResult] = useState<{ name: string; clashes: TagNameClash[] }>({ name: "", clashes: [] });
  // Compare and suggest in the one spelling the name will be saved in
  const trimmed = toTagName(name);

  useEffect(() => {
    if (!trimmed) return;
    let alive = true;
    const t = setTimeout(() => {
      findTagNameClashesAction(trimmed, excludeId)
        .then((clashes) => {
          if (alive) setResult({ name: trimmed, clashes });
        })
        .catch(() => {});
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [trimmed, excludeId]);

  const reformatted = !!name.trim() && trimmed !== name.trim();
  const clashes = trimmed && result.name === trimmed ? result.clashes : [];
  if (!reformatted && clashes.length === 0) return null;
  if (clashes.length === 0) {
    return (
      <p role="status" className={cn("text-[11px] text-muted-foreground", className)}>
        {trimmed ? (
          <>
            Saved as <code className="rounded bg-muted px-1 font-mono text-foreground">{trimmed}</code> — tag names are
            lower case with hyphens
          </>
        ) : (
          "A tag name needs letters or digits"
        )}
      </p>
    );
  }
  const suggestion = qualifiedTagName(trimmed, groupName);
  const where = clashes
    .map((c) => (c.via === "alias" ? `alias of ${c.tagName} (${c.groupName})` : c.groupName))
    .join(", ");

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      <TriangleAlert size={11} className="shrink-0" aria-hidden="true" />
      <span>
        “{trimmed}” already exists in {where} — the name would be ambiguous.
      </span>
      {onUseSuggestion && suggestion.toLowerCase() !== trimmed.toLowerCase() && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onUseSuggestion(suggestion)}
          className="rounded border border-amber-500/40 px-1.5 py-px font-medium transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Use “{suggestion}”
        </button>
      )}
    </div>
  );
}
