"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const types = [
  { value: "all", label: "All" },
  { value: "REFERENCE", label: "Reference" },
  { value: "PRODUCTION", label: "Production" },
] as const;

export function SessionTypeFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("type") ?? "all";

  function handleSelect(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("type");
    } else {
      params.set("type", value);
    }
    router.replace(`/sessions?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => handleSelect(t.value)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            current === t.value
              ? "border-primary/30 bg-primary/15 text-primary"
              : "border-white/15 bg-muted/50 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
