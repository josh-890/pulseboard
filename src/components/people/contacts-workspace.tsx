"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, EyeOff, Eye, Unlock, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ContactLinkPicker } from "@/components/people/contact-link-picker";
import { cn } from "@/lib/utils";
import type { ContactRow } from "@/lib/services/relationship-service";
import {
  addPersonFromContactAction,
  linkContactAction,
  ignoreContactAction,
  loadMoreContactsAction,
} from "@/lib/actions/contact-actions";

type ContactsWorkspaceProps = {
  head: ContactRow[]; // priority: contacts that unlock approved sets, ranked
  tail: ContactRow[]; // first page of the name-sorted remainder
  tailNextOffset: number | null;
  headIds: string[]; // excluded from the tail; passed back to "load more"
  q?: string;
  includeIgnored: boolean;
};

export function ContactsWorkspace({ head, tail, tailNextOffset, headIds, q, includeIgnored }: ContactsWorkspaceProps) {
  const [tailRows, setTailRows] = useState<ContactRow[]>(tail);
  const [nextOffset, setNextOffset] = useState<number | null>(tailNextOffset);
  const [isLoading, startLoad] = useTransition();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Re-seed when the server re-renders (e.g. router.refresh after a row action):
  // collapse back to the fresh first page. (Filter/search changes remount via key.)
  useEffect(() => { setTailRows(tail); }, [tail]);
  useEffect(() => { setNextOffset(tailNextOffset); }, [tailNextOffset]);

  const loadMore = useCallback(() => {
    if (nextOffset == null || isLoading) return;
    startLoad(async () => {
      const res = await loadMoreContactsAction({ q, includeIgnored, offset: nextOffset, excludeIds: headIds });
      setTailRows((prev) => [...prev, ...res.rows]);
      setNextOffset(res.nextOffset);
    });
  }, [nextOffset, isLoading, q, includeIgnored, headIds]);

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMoreRef.current();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (head.length === 0 && tailRows.length === 0) {
    return (
      <div className="rounded-xl border border-white/15 bg-card/40 p-10 text-center text-sm text-muted-foreground">
        No contacts. People mentioned on imports or staged sets but not yet added will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {head.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Unlock size={13} className="text-emerald-500" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Unlocks approved sets
            </h2>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
              {head.length}
            </span>
          </div>
          <ul className="space-y-2">
            {head.map((row) => (
              <ContactRowItem key={row.id} row={row} />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        {head.length > 0 && (
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">All contacts</h2>
        )}
        <ul className="space-y-2">
          {tailRows.map((row) => (
            <ContactRowItem key={row.id} row={row} />
          ))}
        </ul>
        {nextOffset != null && (
          <div ref={sentinelRef} className="flex justify-center py-3">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={loadMore} disabled={isLoading}>
              {isLoading ? <Loader2 size={13} className="animate-spin" /> : null}
              Load more
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function ContactRowItem({ row }: { row: ContactRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initials = row.name.charAt(0).toUpperCase();

  function handleAdd() {
    startTransition(async () => {
      const res = await addPersonFromContactAction(row.id);
      if (res.success) {
        toast.success(`Added ${row.name} as a person`);
        router.push(`/people/${res.id}`);
      } else {
        const msg =
          typeof res.error === "string"
            ? res.error
            : Object.values(res.error.fieldErrors ?? {})[0]?.[0] ?? "Could not add person";
        toast.error(msg);
      }
    });
  }

  function handleLink(personId: string) {
    startTransition(async () => {
      const res = await linkContactAction(row.id, personId);
      if (res.success) {
        toast.success(`Linked ${row.name}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not link");
      }
    });
  }

  function handleIgnore(ignored: boolean) {
    startTransition(async () => {
      const res = await ignoreContactAction(row.id, ignored);
      if (res.success) {
        toast.success(ignored ? "Contact ignored" : "Contact restored");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not update");
      }
    });
  }

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border border-dashed border-white/25 bg-card/30 p-3 transition-opacity",
        row.ignoredAt && "opacity-50",
        isPending && "pointer-events-none opacity-60",
      )}
    >
      {/* The DASHED outline is what signals "ghost / not yet a Person" — it stays
          whether or not there is a face inside it. A face is worth showing: this
          register is where you recognise someone, and initials recognise nobody.
          Falls back to initials when neither a harvested thumbnail nor a
          catalogue portrait exists. */}
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-dashed border-white/30">
        {row.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote/MinIO URL, not a static asset
          <img src={row.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
            {initials}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/people/contacts/${row.id}`}
            className="truncate text-sm font-medium hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {row.name}
          </Link>
          {row.icgId && (
            <span className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              {row.icgId}
            </span>
          )}
          {(row.nationality || row.birthYear) && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {[row.nationality, row.birthYear].filter(Boolean).join(" · ")}
            </span>
          )}
          {row.unlocksSetCount > 0 && (
            <span
              title="Approved, archive-linked sets where this is the only missing participant — adding it unlocks them for promotion"
              className="shrink-0 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
            >
              <Unlock size={10} /> unlocks {row.unlocksSetCount} {row.unlocksSetCount === 1 ? "set" : "sets"}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {row.archiveFolderCount > 0 && (
            <>
              {row.archiveFolderCount} archive {row.archiveFolderCount === 1 ? "folder" : "folders"}
              {" · "}
            </>
          )}
          {row.mentionCount} {row.mentionCount === 1 ? "mention" : "mentions"}
          {row.claimCount > 0 && ` · ${row.claimCount} claimed`}
          {row.relationshipCount > 0 && ` · ${row.relationshipCount} relationship${row.relationshipCount === 1 ? "" : "s"}`}
          {row.subjects.length > 0 && ` · with ${row.subjects.slice(0, 3).join(", ")}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {row.icgId && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={handleAdd} disabled={isPending}>
            <UserPlus size={13} /> Add as Person
          </Button>
        )}
        <ContactLinkPicker onPick={handleLink} disabled={isPending} />
        {row.ignoredAt ? (
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => handleIgnore(false)} disabled={isPending}>
            <Eye size={13} /> Restore
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => handleIgnore(true)} disabled={isPending}>
            <EyeOff size={13} /> Ignore
          </Button>
        )}
      </div>
    </li>
  );
}
