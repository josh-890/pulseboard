"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProjectRole } from "@/lib/types";

const roles: { value: ProjectRole | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "stakeholder", label: "Stakeholder" },
  { value: "lead", label: "Lead" },
  { value: "member", label: "Member" },
];

export function RoleFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = (searchParams.get("role") as ProjectRole | "all") ?? "all";

  function handleChange(role: ProjectRole | "all") {
    const params = new URLSearchParams(searchParams.toString());
    if (role === "all") {
      params.delete("role");
    } else {
      params.set("role", role);
    }
    router.push(`/people?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {roles.map((role) => (
        <Button
          key={role.value}
          variant={current === role.value ? "default" : "outline"}
          size="sm"
          onClick={() => handleChange(role.value)}
          className={cn(
            current !== role.value &&
              "bg-card/50 backdrop-blur-sm hover:bg-card/80",
          )}
        >
          {role.label}
        </Button>
      ))}
    </div>
  );
}
