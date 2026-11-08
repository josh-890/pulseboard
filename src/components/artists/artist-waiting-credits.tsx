"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { linkArtistCreditsAction } from "@/lib/actions/artist-actions";
import type { WaitingCredit } from "@/lib/services/artist-credit-service";

type ArtistWaitingCreditsProps = {
  artistId: string;
  credits: WaitingCredit[];
};

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "????-??-??");

/**
 * Credits on sets that may be theirs: the same name (or alias) — link them all
 * at once or one by one — and similar names, which you decide one by one.
 */
export function ArtistWaitingCredits({ artistId, credits }: ArtistWaitingCreditsProps) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const exact = credits.filter((c) => c.exact && !c.ambiguous);

  function link(ids?: string[]) {
    start(async () => {
      const res = await linkArtistCreditsAction(artistId, ids);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.linked} credit${res.linked === 1 ? "" : "s"} linked`);
      router.refresh();
    });
  }

  if (credits.length === 0) {
    return <p className="text-sm italic text-muted-foreground/70">No open credits carry this name, an alias, or a similar one.</p>;
  }

  return (
    <div className="space-y-3">
      {exact.length > 1 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-card/40 p-3">
          <p className="text-sm">
            <span className="font-semibold">{exact.length}</span> credits carry exactly their name or an alias.
          </p>
          <Button size="sm" onClick={() => link()} disabled={isPending} className="gap-1.5">
            {isPending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Link all {exact.length}
          </Button>
        </div>
      )}
      <ul className="space-y-1.5">
        {credits.map((c) => (
          <li
            key={c.creditId}
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-l-[3px] border-white/15 bg-card/40 px-3 py-2",
              c.exact ? "border-l-emerald-400/70" : "border-l-amber-400/70",
            )}
          >
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{isoDate(c.releaseDate)}</span>
            <Link href={`/sets/${c.setId}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary">
              {c.setTitle}
              {c.channelName && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {c.channelName}</span>}
            </Link>
            <span className="text-xs">
              credited as <span className="font-medium">“{c.rawName}”</span>
            </span>
            {c.ambiguous ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400" title="Another artist has this exact name too">
                <AlertTriangle size={11} aria-hidden="true" /> also another artist&apos;s name
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">{c.exact ? "same name" : `similar · ${Math.round(c.similarity * 100)} %`}</span>
            )}
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={isPending} onClick={() => link([c.creditId])}>
              <Link2 size={12} /> Link
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
