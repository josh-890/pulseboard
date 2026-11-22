"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComposerTagChipProps = {
  name: string;
  /** The facet, in small type */
  facet?: string;
  /** Select this value in the tree */
  onOpen?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
  emphasis?: boolean;
};

/** A linked value in the relations view: its name opens it, × unlinks it */
export function ComposerTagChip({ name, facet, onOpen, onRemove, disabled, emphasis }: ComposerTagChipProps) {
  return (
    <span
      data-testid="composer-relation-chip"
      data-tag={name}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        emphasis ? "border-primary/50 bg-primary/10 font-semibold" : "border-border/60 bg-background/60",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="truncate rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:underline"
      >
        {name}
      </button>
      {facet && <span className="shrink-0 text-[10px] text-muted-foreground">{facet}</span>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Unlink ${name}`}
          className="shrink-0 rounded text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <X size={11} aria-hidden />
        </button>
      )}
    </span>
  );
}
