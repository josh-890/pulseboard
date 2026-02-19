import { Users } from "lucide-react";
import { PersonCard } from "./person-card";
import type { PersonWithCommonAlias } from "@/lib/types";

type PersonListProps = {
  persons: PersonWithCommonAlias[];
};

export function PersonList({ persons }: PersonListProps) {
  if (persons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users size={48} className="mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">No people found.</p>
        <p className="mt-1 text-sm text-muted-foreground/60">
          Try adjusting your search or filters.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {persons.map((person) => (
        <PersonCard key={person.id} person={person} />
      ))}
    </div>
  );
}
