"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

// Person filter for the favorites gallery — narrows to images linked to a person.
export function FavoritesPersonFilter({
  persons,
  favoritePersonsOnly,
}: {
  persons: { id: string; name: string }[];
  favoritePersonsOnly: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get("person") ?? "";

  function navigate(params: URLSearchParams) {
    router.push(`/favorites${params.toString() ? `?${params}` : ""}`);
  }

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("person", value);
    else params.delete("person");
    navigate(params);
  }

  function toggleFavPersons() {
    const params = new URLSearchParams(searchParams.toString());
    if (favoritePersonsOnly) params.delete("favPersons");
    else params.set("favPersons", "true");
    navigate(params);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={toggleFavPersons}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
          favoritePersonsOnly
            ? "border-amber-500/40 bg-amber-500/15 text-amber-400"
            : "border-white/15 bg-muted/30 text-muted-foreground hover:text-foreground",
        )}
      >
        <Star size={13} fill={favoritePersonsOnly ? "currentColor" : "none"} />
        Favorite persons
      </button>
      {persons.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Person</span>
          <select
            value={active}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-lg border border-white/15 bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Everyone</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
