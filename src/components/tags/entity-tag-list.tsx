"use client";

import { ListTodo, Plus, X } from "lucide-react";
import type { EffectiveTag } from "@/lib/effective-tags";
import { cn } from "@/lib/utils";

export type EntityTagListProps = {
  tags: EffectiveTag[];
  isLoading?: boolean;
  /** Remove a direct tag; omit for a read-only list */
  onRemove?: (tagId: string) => void;
  /** Opens the tag palette; omit to hide the add button */
  onAdd?: () => void;
  /** Show the `T` hint on the add button (where the hotkey is live) */
  showHotkey?: boolean;
  /** Light text on the dark lightbox panel */
  tone?: "default" | "onDark";
};

function originText(tag: EffectiveTag): string {
  if (!tag.origin) return "";
  const where = tag.origin.level === "SET" ? "set" : "session";
  return `from ${where} ${tag.origin.label}`;
}

// ADR-0033 display: an entity's effective tags, grouped by tag group.
//   direct     — solid chip in the group colour, removable
//   inherited  — dashed + dimmed, "from set/session …" on hover
//   overridden — an exclusive-group tag a nearer level shadows: struck through
//   workflow   — to-do markers read as a badge, not a description
export function EntityTagList({
  tags,
  isLoading,
  onRemove,
  onAdd,
  showHotkey,
  tone = "default",
}: EntityTagListProps) {
  const onDark = tone === "onDark";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isLoading && tags.length === 0 && (
        <span className={cn("text-xs", onDark ? "text-white/40" : "text-muted-foreground")}>Loading tags…</span>
      )}
      {tags.map((tag) => {
        const inherited = tag.source !== "DIRECT";
        const workflow = tag.kind === "WORKFLOW";
        const title = [
          `${tag.group.name}: ${tag.name}`,
          inherited ? originText(tag) : null,
          tag.overridden ? "shadowed by a tag set closer to this item" : null,
        ]
          .filter(Boolean)
          .join(" — ");
        return (
          <span
            key={`${tag.id}-${tag.source}`}
            title={title}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-opacity duration-150",
              onDark ? "text-white/85" : "text-foreground",
              workflow && "rounded-md border-amber-500/50 bg-amber-500/15",
              inherited && "border-dashed opacity-60",
              tag.overridden && "line-through opacity-35",
            )}
            style={
              workflow
                ? undefined
                : { backgroundColor: `${tag.group.color}22`, borderColor: `${tag.group.color}66` }
            }
          >
            {workflow ? (
              <ListTodo size={11} className="shrink-0 text-amber-500" aria-hidden="true" />
            ) : (
              <span
                className="inline-block size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: tag.group.color }}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{tag.name}</span>
            {inherited && <span className="sr-only">({originText(tag)})</span>}
            {!inherited && onRemove && (
              <button
                type="button"
                onClick={() => onRemove(tag.id)}
                className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={workflow ? `Mark ${tag.name} done` : `Remove tag ${tag.name}`}
                title={workflow ? "Done — remove" : "Remove"}
              >
                <X size={11} aria-hidden="true" />
              </button>
            )}
          </span>
        );
      })}
      {!isLoading && tags.length === 0 && !onAdd && (
        <span className={cn("text-xs italic", onDark ? "text-white/40" : "text-muted-foreground")}>No tags</span>
      )}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            onDark
              ? "border-white/25 text-white/60 hover:border-white/50 hover:text-white"
              : "border-white/20 text-muted-foreground hover:border-white/40 hover:text-foreground",
          )}
          aria-label="Add tag"
        >
          <Plus size={11} aria-hidden="true" />
          Tag
          {showHotkey && (
            <kbd className={cn("ml-0.5 rounded border px-1 text-[10px]", onDark ? "border-white/20" : "border-white/15")}>
              T
            </kbd>
          )}
        </button>
      )}
    </div>
  );
}
