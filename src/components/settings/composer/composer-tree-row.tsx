"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComposerTreeRowProps = {
  kind: "path" | "section" | "facet" | "value";
  depth: 0 | 1 | 2 | 3;
  name: string;
  meta?: ReactNode;
  dot?: string;
  selected: boolean;
  /** undefined = a leaf */
  expanded?: boolean;
  onExpand?: () => void;
  onSelect: () => void;
  /** null at the edge */
  onMove: (step: -1 | 1) => void;
  canMove: { up: boolean; down: boolean };
};

const INDENT = ["w-0", "w-3", "w-6", "w-9"] as const;

/** One row of the Composer tree: fold, select, ↑ ↓ among its siblings */
export function ComposerTreeRow({ kind, depth, name, meta, dot, selected, expanded, onExpand, onSelect, onMove, canMove }: ComposerTreeRowProps) {
  const expandable = expanded !== undefined;
  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={expanded}
      data-testid={`composer-tree-${kind}`}
      data-name={name}
      className={cn(
        "group flex items-center gap-1 rounded-md pr-1 text-sm transition-colors duration-150",
        selected ? "bg-primary/10 text-foreground" : "hover:bg-muted/50",
      )}
    >
      <span aria-hidden className={cn("shrink-0", INDENT[depth])} />
      {expandable ? (
        <button
          type="button"
          onClick={onExpand}
          aria-label={expanded ? `Fold ${name}` : `Unfold ${name}`}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight size={14} className={cn("transition-transform duration-150 motion-reduce:transition-none", expanded && "rotate-90")} aria-hidden />
        </button>
      ) : (
        <span aria-hidden className="w-[18px] shrink-0" />
      )}
      <button
        type="button"
        onClick={onSelect}
        data-testid="composer-tree-select"
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {dot && <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />}
        <span className={cn("truncate", depth < 2 && "font-medium")}>{name}</span>
        {meta && <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">{meta}</span>}
      </button>
      <span className={cn("flex shrink-0 items-center", selected ? "opacity-100" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100")}>
        <button
          type="button"
          disabled={!canMove.up}
          onClick={() => onMove(-1)}
          aria-label={`Move ${name} up`}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
        >
          <ArrowUp size={12} aria-hidden />
        </button>
        <button
          type="button"
          disabled={!canMove.down}
          onClick={() => onMove(1)}
          aria-label={`Move ${name} down`}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
        >
          <ArrowDown size={12} aria-hidden />
        </button>
      </span>
    </div>
  );
}
