import { Suspense } from "react";
import { PersonSearch } from "@/components/people/person-search";
import { RoleFilter } from "@/components/people/role-filter";
import { PersonList } from "@/components/people/person-list";
import {
  searchPersons,
  getPersonRoles,
} from "@/lib/services/person-service";
import type { ProjectRole, PersonProjectAssignment } from "@/lib/types";

type PeoplePageProps = {
  searchParams: Promise<{ q?: string; role?: string }>;
};

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const { q, role } = await searchParams;
  const persons = await searchPersons(
    q ?? "",
    (role as ProjectRole | "all") ?? "all",
  );

  const personRolesEntries = await Promise.all(
    persons.map(async (person) => {
      const roles = await getPersonRoles(person.id);
      return [person.id, roles] as [string, PersonProjectAssignment[]];
    }),
  );
  const personRoles = new Map<string, PersonProjectAssignment[]>(
    personRolesEntries,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold">People</h1>
      <Suspense fallback={null}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <PersonSearch />
          </div>
          <RoleFilter />
        </div>
      </Suspense>
      <PersonList persons={persons} personRoles={personRoles} />
    </div>
  );
}
