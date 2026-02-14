"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/types";

const statuses: { value: ProjectStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
];

export function StatusFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = (searchParams.get("status") as ProjectStatus | "all") ?? "all";

  function handleChange(status: ProjectStatus | "all") {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "all") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    router.push(`/projects?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((status) => (
        <Button
          key={status.value}
          variant={current === status.value ? "default" : "outline"}
          size="sm"
          onClick={() => handleChange(status.value)}
          className={cn(
            current !== status.value &&
              "bg-card/50 backdrop-blur-sm hover:bg-card/80",
          )}
        >
          {status.label}
        </Button>
      ))}
    </div>
  );
}
