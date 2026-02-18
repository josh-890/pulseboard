import Link from "next/link";
import { MapPin, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PersonWithPrimaryAlias, PersonStatus } from "@/lib/types";

type PersonCardProps = {
  person: PersonWithPrimaryAlias;
};

const STATUS_STYLES: Record<PersonStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  inactive: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
  wishlist: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  archived: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

const STATUS_LABELS: Record<PersonStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  wishlist: "Wishlist",
  archived: "Archived",
};

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function PersonCard({ person }: PersonCardProps) {
  const displayName = person.primaryAlias ?? `${person.firstName} ${person.lastName}`;
  const initials = getInitials(person.firstName, person.lastName);
  const visibleTags = person.tags.slice(0, 3);

  return (
    <Link href={`/people/${person.id}`} className="group block focus-visible:outline-none">
      <div
        className={cn(
          "rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm",
          "transition-all duration-200",
          "hover:border-white/30 hover:bg-card/90 hover:shadow-lg hover:-translate-y-0.5",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
        )}
      >
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary ring-2 ring-primary/20"
            aria-hidden="true"
          >
            {initials}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <p className="truncate text-base font-semibold leading-tight">{displayName}</p>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                  STATUS_STYLES[person.status],
                )}
              >
                {STATUS_LABELS[person.status]}
              </span>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {person.hairColor && (
                <span className="flex items-center gap-1">
                  <Sparkles size={12} className="shrink-0" />
                  {person.hairColor}
                </span>
              )}
              {person.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} className="shrink-0" />
                  {person.location}
                </span>
              )}
            </div>

            {/* Tags */}
            {visibleTags.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {visibleTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
                {person.tags.length > 3 && (
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                    +{person.tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
