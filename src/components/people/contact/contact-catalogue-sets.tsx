import Link from "next/link";
import { Archive, Film, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContactCatalogueSet } from "@/lib/services/contact-service";

type ContactCatalogueSetsProps = {
  sets: ContactCatalogueSet[];
  total: number;
  /** Channel names linked through an import alias → channel id */
  linkedChannels: Record<string, string>;
};

const fmt = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "no date");

/** Her catalogue sets — reference knowledge — marked in your archive / in the app / catalogue only */
export function ContactCatalogueSets({ sets, total, linkedChannels }: ContactCatalogueSetsProps) {
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No catalogue sets yet — they arrive with the catalogue load.</p>;
  }
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-white/10 rounded-xl border border-white/15 bg-card/40">
        {sets.map((s) => {
          const href = s.inApp?.setId
            ? `/sets/${s.inApp.setId}`
            : s.inApp?.stagingSetId
              ? `/staging-sets?select=${s.inApp.stagingSetId}`
              : null;
          const Kind = s.isVideo ? Film : ImageIcon;
          const channelId = linkedChannels[s.channelName];
          return (
            <li key={s.coverId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <Kind size={14} className="shrink-0 text-muted-foreground" aria-label={s.isVideo ? "Video" : "Photo set"} />
              <span className="w-24 shrink-0 tabular-nums text-xs text-muted-foreground">{fmt(s.date)}</span>
              <span className="w-36 shrink-0 truncate text-xs">
                {channelId ? (
                  <Link href={`/channels/${channelId}`} className="hover:underline">
                    {s.channelName}
                  </Link>
                ) : (
                  <span className="text-muted-foreground" title="Channel not linked — no import alias names it">
                    {s.channelName}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {href ? (
                  <Link href={href} className="font-medium hover:underline focus-visible:underline focus-visible:outline-none">
                    {s.title}
                  </Link>
                ) : (
                  s.title
                )}
              </span>
              {s.castIcgIds.length > 1 && (
                <span className="shrink-0 text-xs text-muted-foreground">+{s.castIcgIds.length - 1} in cast</span>
              )}
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  s.inArchive
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : s.inApp
                      ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                      : "bg-muted/60 text-muted-foreground",
                )}
              >
                {s.inArchive && <Archive size={10} aria-hidden />}
                {s.inArchive ? "in your archive" : s.inApp ? "in the app" : "catalogue only"}
              </span>
            </li>
          );
        })}
      </ul>
      {total > sets.length && (
        <p className="text-xs text-muted-foreground">
          Showing the newest {sets.length} of {total.toLocaleString()} catalogue sets.
        </p>
      )}
    </div>
  );
}
