"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BodyRegionFilter } from "@/components/shared/body-region-picker";

export function BodyRegionFilterWrapper() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selected = searchParams.get("bodyRegions")?.split(",").filter(Boolean) ?? [];
  const matchMode = (searchParams.get("bodyRegionMatch") === "all" ? "all" : "any") as "any" | "all";

  const updateParams = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      updater(params);
      params.delete("loaded");
      router.replace(`/people?${params.toString()}`);
    },
    [searchParams, router],
  );

  const handleChange = useCallback(
    (regions: string[]) => {
      updateParams((params) => {
        if (regions.length > 0) {
          params.set("bodyRegions", regions.join(","));
        } else {
          params.delete("bodyRegions");
          params.delete("bodyRegionMatch");
        }
      });
    },
    [updateParams],
  );

  const handleMatchModeChange = useCallback(
    (mode: "any" | "all") => {
      updateParams((params) => {
        if (mode === "any") {
          params.delete("bodyRegionMatch");
        } else {
          params.set("bodyRegionMatch", mode);
        }
      });
    },
    [updateParams],
  );

  return (
    <BodyRegionFilter
      selected={selected}
      onChange={handleChange}
      matchMode={matchMode}
      onMatchModeChange={handleMatchModeChange}
    />
  );
}
