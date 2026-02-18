import { PersonCardSkeleton } from "./person-card-skeleton";

export function PersonListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6">
      {Array.from({ length: 18 }).map((_, i) => (
        <PersonCardSkeleton key={i} />
      ))}
    </div>
  );
}
