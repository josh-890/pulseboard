"use client";

import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposerCastMember } from "@/lib/services/composer-service";

export type ComposerPersonBarProps = {
  /** The people this photo shows, in cast order */
  persons: ComposerCastMember[];
  /** The lane being described */
  laneId: string;
  onLane: (personId: string) => void;
  /** person id → how many personal tags they hold in the draft */
  counts: Record<string, number>;
  /** Tags written before lanes, waiting to be given to someone */
  waiting: number;
};

/**
 * Who is being described (ADR-0043): one chip per person the photo shows. The
 * Figure, Expression, Clothing and Detail tabs then describe that person — a
 * "one" facet holds per person; the shot and the camera stay the photo's.
 * Keys: `[` and `]` step through the people.
 */
export function ComposerPersonBar({ persons, laneId, onLane, counts, waiting }: ComposerPersonBarProps) {
  return (
    <div role="radiogroup" aria-label="Describing" className="flex flex-wrap items-center gap-1 border-b border-border/60 px-2 py-1.5" data-testid="composer-person-bar">
      <Users size={13} aria-hidden className="mr-0.5 shrink-0 text-muted-foreground" />
      {persons.map((p) => {
        const active = p.id === laneId;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onLane(p.id)}
            data-testid="composer-person"
            data-person={p.icgId}
            title={`${p.name} (${p.icgId}) — the Figure, Expression, Clothing and Detail tabs describe this person · [ ] to switch`}
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[11px] font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "border-primary/60 bg-primary/15 text-foreground" : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {p.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
              <img src={p.avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px]">{p.name.slice(0, 1)}</span>
            )}
            <span className="truncate">
              {p.name} <span className="font-normal text-muted-foreground">({p.icgId})</span>
            </span>
            {(counts[p.id] ?? 0) > 0 && <span className="rounded-full bg-muted px-1 text-[9px] tabular-nums text-muted-foreground">{counts[p.id]}</span>}
          </button>
        );
      })}
      {waiting > 0 && (
        <span className="ml-auto text-[10px] text-muted-foreground" data-testid="composer-waiting" title="Tagged before people were told apart — a click on such a tile (grey) gives it to the person chosen">
          {waiting} to give to someone
        </span>
      )}
    </div>
  );
}
