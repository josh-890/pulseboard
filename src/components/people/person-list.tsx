import type { Person, PersonProjectAssignment } from "@/lib/types";
import { PersonCard } from "./person-card";
import { EmptyState } from "./empty-state";

type PersonListProps = {
  persons: Person[];
  personRoles: Map<string, PersonProjectAssignment[]>;
  personPhotos: Map<string, string>;
};

export function PersonList({ persons, personRoles, personPhotos }: PersonListProps) {
  if (persons.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
      {persons.map((person) => (
        <PersonCard
          key={person.id}
          person={person}
          roles={personRoles.get(person.id) ?? []}
          photoUrl={personPhotos.get(person.id) ?? null}
        />
      ))}
    </div>
  );
}
