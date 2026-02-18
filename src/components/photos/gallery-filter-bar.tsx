"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type GalleryFilterBarProps = {
  basePath: string;
};

const TAG_FILTERS = [
  { value: "all", label: "All" },
  { value: "portrait", label: "Portrait" },
  { value: "diploma", label: "Diploma" },
  { value: "tattoo", label: "Tattoo" },
  { value: "document", label: "Document" },
  { value: "general", label: "General" },
  { value: "outtake", label: "Outtake" },
];

export function GalleryFilterBar({ basePath }: GalleryFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTag = searchParams.get("tag") ?? "all";

  function handleFilter(tag: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (tag === "all") {
      params.delete("tag");
    } else {
      params.set("tag", tag);
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by tag">
      {TAG_FILTERS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={activeTag === value}
          onClick={() => handleFilter(value)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150",
            activeTag === value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
