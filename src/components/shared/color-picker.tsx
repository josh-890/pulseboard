"use client";

import { cn } from "@/lib/utils";

type ColorPickerProps = {
  value: string;
  onChange: (color: string) => void;
  colors: readonly string[];
};

export function ColorPicker({ value, onChange, colors }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={cn(
            "h-8 w-8 rounded-full transition-all",
            value === color
              ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
              : "hover:scale-110",
          )}
          style={{ backgroundColor: color }}
          aria-label={`Select color ${color}`}
        />
      ))}
    </div>
  );
}
