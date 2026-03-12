"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SkillLevel } from "@/generated/prisma/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SkillDefOption = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  pgrade: number | null;
  defaultLevel: SkillLevel | null;
};

export type SkillGroupOption = {
  id: string;
  name: string;
  definitions: SkillDefOption[];
};

type SkillComboboxProps = {
  skillGroups: SkillGroupOption[];
  assignedSkillIds: Set<string>;
  onSelect: (skillDef: SkillDefOption) => void;
  isPending?: boolean;
  triggerClassName?: string;
};

// ─── Component ──────────────────────────────────────────────────────────────

export function SkillCombobox({
  skillGroups,
  assignedSkillIds,
  onSelect,
  isPending,
  triggerClassName,
}: SkillComboboxProps) {
  const [open, setOpen] = useState(false);

  // Filter out groups with no available definitions
  const availableGroups = skillGroups.filter(
    (g) => g.definitions.some((d) => !assignedSkillIds.has(d.id)),
  );

  const allAssigned = availableGroups.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isPending || allAssigned}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed",
            triggerClassName,
          )}
        >
          <Plus size={14} />
          Add skill
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 border-white/15 bg-background/95 backdrop-blur-sm"
        align="start"
        sideOffset={4}
      >
        <Command className="bg-transparent">
          <CommandInput placeholder="Search skills..." />
          <CommandList>
            <CommandEmpty>No skills found.</CommandEmpty>
            {skillGroups.map((group) => {
              const availableDefs = group.definitions.filter(
                (d) => !assignedSkillIds.has(d.id),
              );
              if (availableDefs.length === 0) return null;
              return (
                <CommandGroup key={group.id} heading={group.name}>
                  {availableDefs.map((def) => (
                    <CommandItem
                      key={def.id}
                      value={`${group.name} ${def.name}`}
                      onSelect={() => {
                        onSelect(def);
                        setOpen(false);
                      }}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">
                            {def.name}
                          </span>
                          {def.pgrade != null && (
                            <span
                              className={cn(
                                "shrink-0 text-[10px] rounded px-1 py-0.5 font-medium",
                                def.pgrade > 0
                                  ? "bg-primary/15 text-primary"
                                  : "bg-muted/50 text-muted-foreground/50",
                              )}
                            >
                              PG {def.pgrade}
                            </span>
                          )}
                        </div>
                        {def.description && (
                          <p className="text-xs text-muted-foreground/70 line-clamp-1">
                            {def.description}
                          </p>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
