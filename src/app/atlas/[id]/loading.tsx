import { Skeleton } from "@/components/ui/skeleton";

export default function AtlasCategoryLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="mb-2 h-4 w-16" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="mt-1 h-4 w-48" />
          </div>
        </div>
      </div>

      <Skeleton className="h-9 w-full max-w-xs rounded-lg" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="aspect-[2/3] w-full rounded-lg" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
