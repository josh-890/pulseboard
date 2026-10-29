"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChannelCheckCatalogueRow } from "@/components/channels/channel-check-catalogue-row";
import type {
  CatalogueChannelHint,
  CatalogueChannelName,
  CatalogueChannelSort,
} from "@/lib/services/channel-check-service";

type ChannelCheckCatalogueProps = {
  rows: (CatalogueChannelName & { hints: CatalogueChannelHint[] })[];
  /** Names matching the search (rows holds the first page of them) */
  matching: number;
  sort: CatalogueChannelSort;
  q: string;
  showAll: boolean;
  channels: { id: string; label: string; description?: string }[];
  labels: { id: string; name: string }[];
};

const SORTS: { value: CatalogueChannelSort; label: string }[] = [
  { value: "waiting", label: "Waiting first" },
  { value: "az", label: "A–Z" },
];

/** The catalogue channel names no import alias links yet — searched, sorted, decided one by one */
export function ChannelCheckCatalogue({ rows, matching, sort, q, showAll, channels, labels }: ChannelCheckCatalogueProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hrefWith = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, v] of Object.entries(changes)) {
      if (v) params.set(key, v);
      else params.delete(key);
    }
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}#check-catalogue`;
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = value.trim();
      if (trimmed === (searchParams.get("cq") ?? "")) return;
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set("cq", trimmed);
      else params.delete("cq");
      params.delete("call");
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}#check-catalogue`, { scroll: false });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, router, pathname, searchParams]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search catalogue channel names…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="pl-9"
            aria-label="Search catalogue channel names"
          />
        </div>
        <div role="group" aria-label="Sort" className="inline-flex rounded-lg border border-white/15 bg-card/40 p-0.5">
          {SORTS.map((s) => (
            <Link
              key={s.value}
              href={hrefWith({ csort: s.value === "waiting" ? null : s.value })}
              scroll={false}
              replace
              aria-current={sort === s.value ? "true" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                sort === s.value ? "bg-primary/15 font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-white/15 bg-card/40 px-4 py-3 text-sm text-muted-foreground">
          {q ? `No unlinked catalogue channel name matches "${q}".` : "Every channel name in the catalogue links to a channel."}
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Catalogue channel names">
          {rows.map((row) => (
            <ChannelCheckCatalogueRow key={row.key} row={row} channels={channels} labels={labels} />
          ))}
        </ul>
      )}

      {matching > rows.length && (
        <Link
          href={hrefWith({ call: "1" })}
          scroll={false}
          replace
          className="inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none"
        >
          Show all {matching.toLocaleString()}
        </Link>
      )}
      {showAll && matching > 50 && (
        <Link
          href={hrefWith({ call: null })}
          scroll={false}
          replace
          className="inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none"
        >
          Show the first 50
        </Link>
      )}
    </div>
  );
}
