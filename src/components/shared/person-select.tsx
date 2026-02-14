"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PersonAvatar } from "@/components/people/person-avatar";
import type { Person } from "@/lib/types";

type PersonSelectProps = {
  persons: Person[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function PersonSelect({
  persons,
  value,
  onChange,
  placeholder = "Select a person…",
}: PersonSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {persons.map((person) => (
          <SelectItem key={person.id} value={person.id}>
            <div className="flex items-center gap-2">
              <PersonAvatar
                firstName={person.firstName}
                lastName={person.lastName}
                avatarColor={person.avatarColor}
                size="sm"
              />
              <span>
                {person.firstName} {person.lastName}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
