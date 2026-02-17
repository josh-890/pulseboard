"use client";

import { cn } from "@/lib/utils";
import type { PhotoTag } from "@/lib/types";

type TagSelectorProps = {
  selected: PhotoTag[];
  onChange: (tags: PhotoTag[]) => void;
  className?: string;
};

const ALL_TAGS: { value: PhotoTag; label: string }[] = [
  { value: "portrait", label: "Portrait" },
  { value: "diploma", label: "Diploma" },
  { value: "tattoo", label: "Tattoo" },
  { value: "document", label: "Document" },
  { value: "general", label: "General" },
];

export function TagSelector({ selected, onChange, className }: TagSelectorProps) {
  function toggle(tag: PhotoTag) {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {ALL_TAGS.map(({ value, label }) => {
        const isSelected = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => toggle(value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-all duration-150",
              isSelected
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
