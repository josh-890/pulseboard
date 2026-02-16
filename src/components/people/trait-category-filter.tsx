"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TraitCategory } from "@/lib/types";

type TraitCategoryFilterProps = {
  categories: TraitCategory[];
};

export function TraitCategoryFilter({ categories }: TraitCategoryFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("traitCategory") ?? "all";

  function handleChange(categoryId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (categoryId === "all") {
      params.delete("traitCategory");
    } else {
      params.set("traitCategory", categoryId);
    }
    router.push(`/people?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={current === "all" ? "default" : "outline"}
        size="sm"
        onClick={() => handleChange("all")}
        className={cn(
          current !== "all" &&
            "bg-card/50 backdrop-blur-sm hover:bg-card/80",
        )}
      >
        All Traits
      </Button>
      {categories.map((category) => (
        <Button
          key={category.id}
          variant={current === category.id ? "default" : "outline"}
          size="sm"
          onClick={() => handleChange(category.id)}
          className={cn(
            current !== category.id &&
              "bg-card/50 backdrop-blur-sm hover:bg-card/80",
          )}
        >
          {category.name}
        </Button>
      ))}
    </div>
  );
}
