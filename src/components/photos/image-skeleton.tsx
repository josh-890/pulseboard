import { cn } from "@/lib/utils";

type ImageSkeletonProps = {
  className?: string;
};

export function ImageSkeleton({ className }: ImageSkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-2xl bg-muted",
        className ?? "aspect-[4/3] w-full",
      )}
    />
  );
}
