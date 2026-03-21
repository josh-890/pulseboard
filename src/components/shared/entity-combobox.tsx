"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type EntityOption = {
  id: string;
  label: string;
  description?: string;
};

type EntityComboboxProps = {
  entities: EntityOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
};

export function EntityCombobox({
  entities,
  value,
  onChange,
  placeholder = "Select...",
  emptyLabel = "None",
  disabled = false,
  className,
}: EntityComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedEntity = entities.find((e) => e.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls="entity-combobox-list"
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm transition-colors",
            "hover:border-white/30 focus:outline-none focus:ring-1 focus:ring-ring",
            "disabled:pointer-events-none disabled:opacity-50",
            !selectedEntity && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {selectedEntity ? selectedEntity.label : placeholder}
          </span>
          <ChevronsUpDown size={14} className="ml-2 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList id="entity-combobox-list">
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {/* None option */}
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <Check
                  size={14}
                  className={cn(
                    "mr-2 shrink-0",
                    !value ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="text-muted-foreground">{emptyLabel}</span>
              </CommandItem>
              {entities.map((entity) => (
                <CommandItem
                  key={entity.id}
                  value={entity.label}
                  onSelect={() => {
                    onChange(entity.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    size={14}
                    className={cn(
                      "mr-2 shrink-0",
                      value === entity.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0">
                    <span className="truncate">{entity.label}</span>
                    {entity.description && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {entity.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
