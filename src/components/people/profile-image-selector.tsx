"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProfileImageLabel } from "@/lib/services/setting-service";

type ProfileImageSelectorProps = {
  labels: ProfileImageLabel[];
};

export function ProfileImageSelector({ labels }: ProfileImageSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("pimg") ?? "p-img01";

  function handleChange(slot: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (slot === "p-img01") {
      params.delete("pimg");
    } else {
      params.set("pimg", slot);
    }
    router.push(`/people?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((item) => (
        <Button
          key={item.slot}
          variant={current === item.slot ? "default" : "outline"}
          size="sm"
          onClick={() => handleChange(item.slot)}
          className={cn(
            current !== item.slot &&
              "bg-card/50 backdrop-blur-sm hover:bg-card/80",
          )}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
