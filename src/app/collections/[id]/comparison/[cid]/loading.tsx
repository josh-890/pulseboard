import { Skeleton } from "@/components/ui/skeleton";

export default function ComparisonLoading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="mb-2 h-4 w-32" />
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-8 w-64 rounded-md" />
        </div>
      </div>
      <div className="flex gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="aspect-[2/3] w-full rounded-lg" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
