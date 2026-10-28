import { Skeleton } from "@/components/ui/skeleton";

export default function CatalogueRunsLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-4 w-20" />
      <div className="space-y-1">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-4 w-64" />
      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}
