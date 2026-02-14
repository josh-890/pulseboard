"use client";

import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PersonAvatar } from "@/components/people/person-avatar";
import type { Person } from "@/lib/types";

type MemberMultiSelectProps = {
  persons: Person[];
  value: string[];
  onChange: (ids: string[]) => void;
  excludeIds?: string[];
};

export function MemberMultiSelect({
  persons,
  value,
  onChange,
  excludeIds = [],
}: MemberMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const availablePersons = persons.filter((p) => !excludeIds.includes(p.id));

  function toggle(personId: string) {
    if (value.includes(personId)) {
      onChange(value.filter((id) => id !== personId));
    } else {
      onChange([...value, personId]);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value.length > 0
            ? `${value.length} member${value.length > 1 ? "s" : ""} selected`
            : "Select members…"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full max-h-60 overflow-y-auto p-2" align="start">
        {availablePersons.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            No available people
          </p>
        ) : (
          <div className="space-y-1">
            {availablePersons.map((person) => (
              <label
                key={person.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <Checkbox
                  checked={value.includes(person.id)}
                  onCheckedChange={() => toggle(person.id)}
                />
                <PersonAvatar
                  firstName={person.firstName}
                  lastName={person.lastName}
                  avatarColor={person.avatarColor}
                  size="sm"
                />
                <span className="text-sm">
                  {person.firstName} {person.lastName}
                </span>
              </label>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
