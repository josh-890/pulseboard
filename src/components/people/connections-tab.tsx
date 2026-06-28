"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Users, Briefcase, FileText, Plus, Trash2, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type {
  ConnectionsData,
  ConnectionCounterpart,
  PersonalRelationshipRow,
  ClaimedRow,
  PersonCoOccurrence,
} from "@/lib/services/relationship-service";
import type { RelationshipRole } from "@/generated/prisma/client";
import {
  createRelationshipAction,
  deleteRelationshipAction,
} from "@/lib/actions/relationship-actions";

type ConnectionsTabProps = {
  data: ConnectionsData;
  personId: string;
  roles: RelationshipRole[];
};

export function ConnectionsTab({ data, personId, roles }: ConnectionsTabProps) {
  return (
    <div className="space-y-6">
      <PersonalSection personId={personId} rows={data.personal} roles={roles} />
      <WorkHeldSection rows={data.workHeld} />
      <ClaimedSection rows={data.claimed} />
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function SectionShell({
  title,
  icon,
  count,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/15 bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
          {count}
        </span>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Avatar({ counterpart, dashed }: { counterpart: ConnectionCounterpart; dashed?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        dashed
          ? "border border-dashed border-white/30 text-muted-foreground"
          : "bg-primary/10 text-primary",
      )}
    >
      {counterpart.name.charAt(0).toUpperCase()}
    </div>
  );
}

// A person counterpart links to its page; a ref counterpart is an outlined chip
// linking to the References register.
function CounterpartName({ counterpart }: { counterpart: ConnectionCounterpart }) {
  if (counterpart.kind === "person") {
    return (
      <Link
        href={`/people/${counterpart.id}`}
        className="truncate text-sm font-medium hover:text-primary"
      >
        {counterpart.name}
      </Link>
    );
  }
  return (
    <Link href="/people/references" className="truncate text-sm font-medium hover:text-foreground">
      {counterpart.name}
      <span className="ml-1.5 rounded border border-dashed border-white/30 px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
        reference
      </span>
    </Link>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <p className="py-2 text-xs text-muted-foreground">{message}</p>;
}

// ── Personal ──────────────────────────────────────────────────────────────────

function PersonalSection({
  personId,
  rows,
  roles,
}: {
  personId: string;
  rows: PersonalRelationshipRow[];
  roles: RelationshipRole[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteRelationshipAction(id, personId);
      if (res.success) {
        toast.success("Relationship removed");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not remove");
      }
    });
  }

  return (
    <SectionShell
      title="Personal relationships"
      icon={<Users size={16} />}
      count={rows.length}
      action={<AddRelationship personId={personId} roles={roles} />}
    >
      {rows.length === 0 ? (
        <EmptyRow message="No personal relationships recorded. Use “Add” to record a sister, partner, mentor…" />
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className={cn(
                "group flex items-center gap-3 rounded-xl border border-white/15 bg-card/40 p-3",
                isPending && "opacity-60",
              )}
            >
              <Avatar counterpart={r.counterpart} dashed={r.counterpart.kind === "ref"} />
              <div className="min-w-0 flex-1">
                <CounterpartName counterpart={r.counterpart} />
                <p className="text-xs text-muted-foreground">
                  {r.roleLabel}
                  {r.note && ` · ${r.note}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                disabled={isPending}
                aria-label="Remove relationship"
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

type PersonHit = { id: string; displayName: string; icgId: string; matchedAlias: string | null };

function AddRelationship({ personId, roles }: { personId: string; roles: RelationshipRole[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<{ kind: "person"; id: string; name: string } | { kind: "newRef"; name: string } | null>(null);
  const [note, setNote] = useState("");

  const rolesByCategory = useMemo(() => {
    const groups: Record<string, RelationshipRole[]> = {};
    for (const r of roles) (groups[r.category] ??= []).push(r);
    return groups;
  }, [roles]);

  function reset() {
    setQuery("");
    setResults([]);
    setPicked(null);
    setNote("");
    setRoleId(roles[0]?.id ?? "");
  }

  async function runSearch(q: string) {
    setQuery(q);
    setPicked(null);
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

  function handleSave() {
    if (!roleId || !picked) return;
    startTransition(async () => {
      const res = await createRelationshipAction({
        personId,
        roleId,
        counterpartPersonId: picked.kind === "person" ? picked.id : undefined,
        newRefName: picked.kind === "newRef" ? picked.name : undefined,
        note: note.trim() || undefined,
      });
      if (res.success) {
        toast.success("Relationship added");
        reset();
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not add");
      }
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Plus size={13} /> Add
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] space-y-3 p-3" align="end">
        {/* Role */}
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Role</label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {Object.entries(rolesByCategory).map(([cat, rs]) => (
              <optgroup key={cat} label={cat}>
                {rs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {!r.isSymmetric ? ` (↔ ${r.inverseName})` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Counterpart */}
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Who</label>
          {picked ? (
            <div className="flex items-center gap-2 rounded-md border border-input bg-muted/30 px-2 py-1.5 text-xs">
              <Check size={13} className="text-green-500" />
              <span className="flex-1 truncate">
                {picked.name}
                {picked.kind === "newRef" && <span className="text-muted-foreground"> (new contact)</span>}
              </span>
              <button type="button" onClick={() => setPicked(null)} className="text-muted-foreground hover:text-foreground">
                change
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => runSearch(e.target.value)}
                  placeholder="Search people, or type a new name…"
                  className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              {(loading || results.length > 0 || query.trim()) && (
                <div className="max-h-[160px] overflow-y-auto rounded-md border border-white/10">
                  {loading && <p className="px-2 py-1.5 text-xs text-muted-foreground">Searching…</p>}
                  {results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setPicked({ kind: "person", id: r.id, name: r.displayName })}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/50"
                    >
                      <span className="flex-1 truncate">{r.displayName}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{r.icgId}</span>
                    </button>
                  ))}
                  {!loading && query.trim() && (
                    <button
                      type="button"
                      onClick={() => setPicked({ kind: "newRef", name: query.trim() })}
                      className="flex w-full items-center gap-2 border-t border-white/10 px-2 py-1.5 text-left text-xs text-primary hover:bg-muted/50"
                    >
                      <Plus size={12} /> Add “{query.trim()}” as a new contact
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Note */}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <Button size="sm" className="w-full text-xs" onClick={handleSave} disabled={!picked || !roleId || isPending}>
          {isPending ? "Saving…" : "Add relationship"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ── Work — held ────────────────────────────────────────────────────────────────

function WorkHeldSection({ rows }: { rows: PersonCoOccurrence[] }) {
  return (
    <SectionShell title="Work — held together" icon={<Briefcase size={16} />} count={rows.length}>
      {rows.length === 0 ? (
        <EmptyRow message="No shared sets yet." />
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.personId} className="flex items-center gap-3 rounded-xl border border-white/15 bg-card/40 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {(r.commonAlias ?? r.icgId).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/people/${r.personId}`} className="truncate text-sm font-medium hover:text-primary">
                  {r.commonAlias ?? r.icgId}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {r.sharedSetCount} shared {r.sharedSetCount === 1 ? "set" : "sets"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

// ── Claimed ────────────────────────────────────────────────────────────────────

function ClaimedSection({ rows }: { rows: ClaimedRow[] }) {
  return (
    <SectionShell title="Claimed collaborations" icon={<FileText size={16} />} count={rows.length}>
      {rows.length === 0 ? (
        <EmptyRow message="No claimed collaborations from imports." />
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-white/15 bg-card/40 p-3">
              <Avatar counterpart={r.counterpart} dashed={r.counterpart.kind === "ref"} />
              <div className="min-w-0 flex-1">
                <CounterpartName counterpart={r.counterpart} />
                <p className="text-xs text-muted-foreground">
                  {r.direction === "outgoing" ? "claimed worked with" : "claims working together"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}
