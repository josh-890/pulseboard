"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EntityKindIcon, ENTITY_KIND } from "@/components/shared/entity-kind-icon";
import { ENTITY_BASE, type TrailEntityType } from "@/lib/browse-trail";
import { parseRecent, readRecentRaw, subscribeRecent } from "@/lib/recently-viewed";
import type { QuickJumpHit } from "@/lib/services/quick-jump-service";

const KIND_ORDER: TrailEntityType[] = ["person", "set", "session", "channel", "label", "artist", "project", "collection", "contact"];

type Row = { type: TrailEntityType; id: string; name: string; detail: string | null };

/**
 * Quick jump (2026-11-13): ⌘K / Ctrl+K (or the Search button) opens a box; type a
 * name, an ICG-ID, a set title … and go straight to that page. Empty, it shows
 * Recently viewed. Results come grouped by kind; ↑ ↓ and Enter work as usual.
 */
export function QuickJump() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<QuickJumpHit[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raw = useSyncExternalStore(subscribeRecent, readRecentRaw, () => null);
  const recent = useMemo(() => parseRecent(raw).slice(0, 8), [raw]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // The physical K key too (other layouts), and in the capture phase so no
      // focused widget swallows it and Chrome's own Ctrl+K search never fires.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.code === "KeyK" || e.key.toLowerCase() === "k")) {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      seq.current++;
      if (timer.current) clearTimeout(timer.current);
      setQ("");
      setHits([]);
      setLoading(false);
    }
  }

  function onQueryChange(value: string) {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    const mine = ++seq.current;
    if (value.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/quick-jump?q=${encodeURIComponent(value.trim())}`);
        const data: QuickJumpHit[] = res.ok ? await res.json() : [];
        if (mine === seq.current) setHits(data);
      } catch {
        if (mine === seq.current) setHits([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 180);
  }

  function go(row: Pick<Row, "type" | "id">) {
    onOpenChange(false);
    router.push(`${ENTITY_BASE[row.type]}/${row.id}`);
  }

  const searching = q.trim().length >= 2;
  const groups = KIND_ORDER.map((type) => ({ type, rows: hits.filter((h) => h.type === type) })).filter((g) => g.rows.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="quick-jump-trigger"
        className="inline-flex h-8 items-center gap-2 rounded-md border border-white/15 bg-card/40 px-2.5 text-sm text-muted-foreground transition-colors hover:border-white/30 hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-[12rem]"
      >
        <Search size={15} aria-hidden="true" />
        <span className="hidden sm:inline">Jump to…</span>
        <span className="sr-only sm:hidden">Jump to a page</span>
        <kbd className="ml-auto hidden rounded border border-white/20 bg-muted/50 px-1.5 font-sans text-[10px] font-medium sm:inline">
          Ctrl K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="top-[15vh] translate-y-0 overflow-hidden border-white/20 bg-background p-0 shadow-2xl sm:max-w-xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Jump to a page</DialogTitle>
          <CommandPrimitive shouldFilter={false} loop className="flex flex-col" data-testid="quick-jump">
            <div className="flex items-center gap-2 border-b border-white/15 px-3">
              <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <CommandPrimitive.Input
                value={q}
                onValueChange={onQueryChange}
                placeholder="Person, ICG-ID, set, channel, label, artist …"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {loading && <Loader2 size={15} className="animate-spin text-muted-foreground" aria-label="Searching" />}
            </div>
            <CommandPrimitive.List className="max-h-[60vh] overflow-y-auto p-1.5">
              {!searching && recent.length > 0 && (
                <Group heading="Recently viewed">
                  {recent.map((r) => (
                    <Item key={`r:${r.type}:${r.id}`} row={{ ...r, detail: ENTITY_KIND[r.type].label }} onGo={go} />
                  ))}
                </Group>
              )}
              {!searching && recent.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">Type at least two letters.</p>
              )}
              {searching && !loading && groups.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing found for “{q.trim()}”.</p>
              )}
              {searching &&
                groups.map((g) => (
                  <Group key={g.type} heading={ENTITY_KIND[g.type].plural}>
                    {g.rows.map((h) => (
                      <Item key={`${h.type}:${h.id}`} row={h} onGo={go} />
                    ))}
                  </Group>
                ))}
            </CommandPrimitive.List>
            <div className="flex items-center gap-3 border-t border-white/15 px-3 py-1.5 text-[11px] text-muted-foreground">
              <span>↑ ↓ choose</span>
              <span>Enter open</span>
              <span>Esc close</span>
            </div>
          </CommandPrimitive>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <CommandPrimitive.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-foreground/60"
    >
      {children}
    </CommandPrimitive.Group>
  );
}

function Item({ row, onGo }: { row: Row; onGo: (row: Row) => void }) {
  return (
    <CommandPrimitive.Item
      value={`${row.type}:${row.id}`}
      onSelect={() => onGo(row)}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 data-[selected=true]:bg-primary/10 data-[selected=true]:ring-1 data-[selected=true]:ring-primary/30"
    >
      <EntityKindIcon type={row.type} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{row.name}</span>
        {row.detail && <span className="block truncate text-[11px] text-muted-foreground">{row.detail}</span>}
      </span>
    </CommandPrimitive.Item>
  );
}
