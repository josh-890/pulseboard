"use client";

import { useState, useMemo } from "react";
import { PersonSearch } from "@/components/people/person-search";
import { RoleFilter } from "@/components/people/role-filter";
import { PersonList } from "@/components/people/person-list";
import {
  searchPersons,
  getPersonRoles,
} from "@/lib/services/person-service";
import type { ProjectRole, PersonProjectAssignment } from "@/lib/types";

export default function PeoplePage() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<ProjectRole | "all">("all");

  const persons = searchPersons(query, role);

  const personRoles = useMemo(() => {
    const map = new Map<string, PersonProjectAssignment[]>();
    for (const person of persons) {
      map.set(person.id, getPersonRoles(person.id));
    }
    return map;
  }, [persons]);

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold">People</h1>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <PersonSearch value={query} onChange={setQuery} />
        </div>
        <RoleFilter value={role} onChange={setRole} />
      </div>
      <PersonList persons={persons} personRoles={personRoles} />
    </div>
  );
}
