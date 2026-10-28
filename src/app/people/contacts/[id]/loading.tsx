import { Skeleton } from "@/components/ui/skeleton";

export default function ContactLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-4 w-20" />
      <div className="flex flex-col gap-5 rounded-2xl border border-white/20 bg-card/70 p-5 sm:flex-row">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-28 w-28 rounded-2xl" />
          <Skeleton className="h-7 w-32 rounded-md" />
        </div>
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-32 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
