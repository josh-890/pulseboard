"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const statuses = [
  { value: "all", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "REFERENCE", label: "Reference" },
] as const;

export function SessionStatusFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("status") ?? "all";

  function handleSelect(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    router.replace(`/sessions?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {statuses.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => handleSelect(s.value)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            current === s.value
              ? "border-primary/30 bg-primary/15 text-primary"
              : "border-white/15 bg-muted/50 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
