"use client";

import { useState } from "react";
import { Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type PersonHit = { id: string; displayName: string; icgId: string; matchedAlias: string | null };

type ContactLinkPickerProps = { onPick: (personId: string) => void; disabled?: boolean };

/** "Link…": attach a Contact to an existing Person (manual reconcile) */
export function ContactLinkPicker({ onPick, disabled }: ContactLinkPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonHit[]>([]);
  const [loading, setLoading] = useState(false);

  async function runSearch(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/people/search?q=${encodeURIComponent(q.trim())}`);
      const data = (await res.json()) as PersonHit[];
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setQuery("");
          setResults([]);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={disabled}>
          <Link2 size={13} /> Link…
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="end">
        <div className="border-b p-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Search existing people…"
              className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <div className="max-h-[220px] overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>}
          {!loading && query && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No people found.</p>
          )}
          {!loading && !query && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Type to search…</p>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onPick(r.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50"
            >
              <span className="flex-1 truncate">
                {r.displayName}
                {r.matchedAlias && <span className="text-muted-foreground"> (a.k.a. {r.matchedAlias})</span>}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{r.icgId}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
