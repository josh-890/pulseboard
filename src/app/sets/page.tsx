import { Suspense } from "react";
import { ImageIcon } from "lucide-react";
import { getSets, getChannelsForSelect } from "@/lib/services/set-service";
import type { SetType } from "@/lib/types";
import { SetGrid } from "@/components/sets/set-grid";
import { SetSearch } from "@/components/sets/set-search";
import { TypeFilter } from "@/components/sets/type-filter";
import { AddSetSheet } from "@/components/sets/add-set-sheet";

export const dynamic = "force-dynamic";

type SetsPageProps = {
  searchParams: Promise<{ q?: string; type?: string }>;
};

const VALID_TYPES = new Set<string>(["photo", "video"]);

function isSetType(value: string): value is SetType {
  return VALID_TYPES.has(value);
}

export default async function SetsPage({ searchParams }: SetsPageProps) {
  const { q, type } = await searchParams;

  const resolvedType = type && isSetType(type) ? type : undefined;

  const [sets, channels] = await Promise.all([
    getSets({ q: q?.trim() || undefined, type: resolvedType ?? "all" }),
    getChannelsForSelect(),
  ]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <ImageIcon size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Sets</h1>
            <p className="text-sm text-muted-foreground">
              {sets.length} {sets.length === 1 ? "set" : "sets"}
            </p>
          </div>
        </div>
        <AddSetSheet channels={channels} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="w-full sm:max-w-xs">
          <Suspense>
            <SetSearch />
          </Suspense>
        </div>
        <Suspense>
          <TypeFilter />
        </Suspense>
      </div>

      {/* Grid */}
      <SetGrid sets={sets} />
    </div>
  );
}
