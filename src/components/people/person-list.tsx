import type { PersonBrowserItem } from "@/lib/types";
import type { DensityMode } from "@/components/layout/density-provider";
import { PersonCard } from "./person-card";
import { EmptyState } from "./empty-state";

type PersonListProps = {
  persons: PersonBrowserItem[];
  density?: DensityMode;
};

export function PersonList({ persons, density = "comfortable" }: PersonListProps) {
  if (persons.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {persons.map((person) => (
        <PersonCard key={person.id} person={person} density={density} />
      ))}
    </div>
  );
}
