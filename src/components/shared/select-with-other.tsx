"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { splitOptionLabel } from "@/lib/utils";

type SelectWithOtherProps = {
  options: readonly string[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
};

const OTHER_SENTINEL = "__other__";

export function SelectWithOther({
  options,
  value,
  onChange,
  placeholder = "Select…",
}: SelectWithOtherProps) {
  // Case-insensitive match against curated options
  const matchedOption = value
    ? options.find((opt) => opt.toLowerCase() === value.toLowerCase())
    : undefined;
  const isOther = value !== undefined && value !== "" && !matchedOption;
  const [otherActive, setOtherActive] = useState(isOther);

  const shouldShowInput = isOther || otherActive;
  const selectValue = !value ? "_none" : matchedOption ? matchedOption : OTHER_SENTINEL;

  function handleSelectChange(v: string) {
    if (v === "_none") {
      setOtherActive(false);
      onChange(undefined);
    } else if (v === OTHER_SENTINEL) {
      setOtherActive(true);
      if (!isOther) onChange(undefined);
    } else {
      setOtherActive(false);
      onChange(v);
    }
  }

  function handleCustomChange(text: string) {
    onChange(text || undefined);
  }

  // Strip the `(anchor)` from the trigger label when a value is picked, so
  // the closed trigger stays compact ("B" not "B (small to medium)"). The
  // dropdown items themselves still show both lines.
  const triggerLabel = matchedOption ? splitOptionLabel(matchedOption).label : null;

  return (
    <div className="space-y-1.5">
      <Select onValueChange={handleSelectChange} value={shouldShowInput ? OTHER_SENTINEL : selectValue}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder}>{triggerLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none">— not specified —</SelectItem>
          {options.map((opt) => {
            const { label, helper } = splitOptionLabel(opt);
            return (
              <SelectItem key={opt} value={opt} className="py-2">
                <div className="flex flex-col items-start">
                  <span>{label}</span>
                  {helper && (
                    <span className="text-xs text-muted-foreground">{helper}</span>
                  )}
                </div>
              </SelectItem>
            );
          })}
          <SelectItem value={OTHER_SENTINEL}>Other…</SelectItem>
        </SelectContent>
      </Select>
      {shouldShowInput && (
        <Input
          value={value ?? ""}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="Enter custom value…"
          className="text-sm"
        />
      )}
    </div>
  );
}
