import { PersonList } from "./person-list";
import {
  searchPersons,
  getPersonRoles,
} from "@/lib/services/person-service";
import type { ProjectRole, PersonProjectAssignment } from "@/lib/types";

type PersonResultsProps = {
  q: string;
  role: ProjectRole | "all";
  traitCategory?: string;
};

export async function PersonResults({ q, role, traitCategory }: PersonResultsProps) {
  const persons = await searchPersons(q, role, traitCategory || undefined);

  const personRolesEntries = await Promise.all(
    persons.map(async (person) => {
      const roles = await getPersonRoles(person.id);
      return [person.id, roles] as [string, PersonProjectAssignment[]];
    }),
  );
  const personRoles = new Map<string, PersonProjectAssignment[]>(
    personRolesEntries,
  );

  return <PersonList persons={persons} personRoles={personRoles} />;
}
