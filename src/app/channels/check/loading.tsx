import { Skeleton } from "@/components/ui/skeleton";

export default function ChannelCheckLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-1 h-4 w-80 max-w-full" />
          </div>
        </div>
      </div>
      {Array.from({ length: 4 }).map((_, s) => (
        <div key={s} className="space-y-3">
          <Skeleton className="h-6 w-64 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}
