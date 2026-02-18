"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type TypeOption = {
  label: string;
  value: string;
};

const TYPE_OPTIONS: TypeOption[] = [
  { label: "All", value: "all" },
  { label: "Photos", value: "photo" },
  { label: "Videos", value: "video" },
];

export function TypeFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentType = searchParams.get("type") ?? "all";

  function handleSelect(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("type");
    } else {
      params.set("type", value);
    }
    router.push(`/sets?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
      {TYPE_OPTIONS.map((option) => {
        const isActive =
          option.value === "all" ? currentType === "all" : currentType === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSelect(option.value)}
            aria-pressed={isActive}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-white/20 bg-card/50 text-muted-foreground hover:border-white/30 hover:bg-card/80 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
