import type { ReactNode } from "react";
import { Camera, Film, ImageOff } from "lucide-react";
import type { SessionMergeCard } from "@/lib/types";
import { cn, formatPartialDateISO } from "@/lib/utils";

// A session as the merge dialog shows it (2026-10-18). A session is known by the
// sets published from it, so they lead — cover, title, channel, release — then
// the people on camera, the label and the counts. Without sets, its own photos
// stand in.

export type MergeSessionCardProps = {
  card: SessionMergeCard;
  /** Top-right badge, e.g. "Stays" / "Merged in" */
  badge?: ReactNode;
  /** Under the card's facts, e.g. the reasons it is suggested */
  footer?: ReactNode;
  /** Fewer sets and people, for the "this session" summary */
  compact?: boolean;
  className?: string;
};

export function MergeSessionCard({ card, badge, footer, compact = false, className }: MergeSessionCardProps) {
  const maxSets = compact ? 2 : 3;
  const maxPeople = compact ? 3 : 4;
  const date = formatPartialDateISO(card.date, card.datePrecision);
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={card.name}>
            {card.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[date || "No date", card.labelName, card.projectName].filter(Boolean).join(" · ")}
          </p>
        </div>
        {badge}
      </div>

      {card.sets.length > 0 ? (
        <ul className="space-y-1.5">
          {card.sets.slice(0, maxSets).map((set) => {
            const TypeIcon = set.type === "video" ? Film : Camera;
            return (
              <li key={set.id} className="flex min-w-0 items-center gap-2">
                <div className="flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                  {set.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={set.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <TypeIcon size={14} aria-hidden="true" className="text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium" title={set.title}>
                    {set.title}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {[set.channelName, formatPartialDateISO(set.releaseDate, set.releaseDatePrecision)].filter(Boolean).join(" · ") ||
                      "No channel or date"}
                  </p>
                </div>
              </li>
            );
          })}
          {card.sets.length > maxSets && (
            <li className="text-[11px] text-muted-foreground">+{card.sets.length - maxSets} more sets</li>
          )}
        </ul>
      ) : card.thumbUrls.length > 0 ? (
        <div className="flex gap-1" aria-label="No sets yet — some of its photos">
          {card.thumbUrls.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" loading="lazy" className="h-12 w-12 rounded object-cover" />
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageOff size={13} aria-hidden="true" /> No sets and no photos
        </p>
      )}

      {card.people.length > 0 && (
        <ul aria-label="On camera" className="flex flex-wrap gap-1">
          {card.people.slice(0, maxPeople).map((p) => (
            <li key={p.id} className="max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground/80">
              {p.name}
            </li>
          ))}
          {card.people.length > maxPeople && (
            <li className="rounded-full px-1 py-0.5 text-[11px] text-muted-foreground">+{card.people.length - maxPeople}</li>
          )}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">
        {card.mediaCount} {card.mediaCount === 1 ? "photo" : "photos"} · {card.sets.length}{" "}
        {card.sets.length === 1 ? "set" : "sets"} · {card.people.length} {card.people.length === 1 ? "person" : "people"}
      </p>
      {footer}
    </div>
  );
}
