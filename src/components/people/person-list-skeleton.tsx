import { PersonCardSkeleton } from "./person-card-skeleton";

export function PersonListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <PersonCardSkeleton key={i} />
      ))}
    </div>
  );
}
