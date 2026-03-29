"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TagChipData = {
  id: string;
  name: string;
  group: { name: string; color: string };
};

type TagChipsProps = {
  tags: TagChipData[];
  onRemove?: (tagId: string) => void;
  compact?: boolean;
};

export function TagChips({ tags, onRemove, compact }: TagChipsProps) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border font-medium",
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
          )}
          style={{
            backgroundColor: tag.group.color + "20",
            borderColor: tag.group.color + "40",
            color: "inherit",
          }}
        >
          <span
            className="inline-block shrink-0 rounded-full"
            style={{
              backgroundColor: tag.group.color,
              width: compact ? 6 : 8,
              height: compact ? 6 : 8,
            }}
          />
          {tag.name}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(tag.id)}
              className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-foreground/10"
              aria-label={`Remove ${tag.name}`}
            >
              <X size={compact ? 10 : 12} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
