import Link from "next/link";
import { Camera, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import type { getSets } from "@/lib/services/set-service";

type SetItem = Awaited<ReturnType<typeof getSets>>[number];

type SetCardProps = {
  set: SetItem;
};

function formatReleaseDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getCastName(
  person: SetItem["contributions"][number]["person"],
): string {
  const common = person.aliases.find((a) => a.type === "common");
  return common?.name ?? person.icgId;
}

export function SetCard({ set }: SetCardProps) {
  const isPhoto = set.type === "photo";
  const visibleCast = set.contributions.slice(0, 3);

  return (
    <Link href={`/sets/${set.id}`} className="group block focus-visible:outline-none">
      <div
        className={cn(
          "rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm",
          "transition-all duration-200",
          "hover:border-white/30 hover:bg-card/90 hover:shadow-lg hover:-translate-y-0.5",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
        )}
      >
        {/* Type badge + title row */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">
            {set.title}
          </h3>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
              isPhoto
                ? "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400"
                : "border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400",
            )}
          >
            {isPhoto ? <Camera size={10} /> : <Film size={10} />}
            {isPhoto ? "Photo" : "Video"}
          </span>
        </div>

        {/* Channel / label */}
        {set.channel && (
          <p className="mb-1 truncate text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {set.channel.name}
            </span>
            {" · "}
            <span>{set.channel.label.name}</span>
          </p>
        )}

        {/* Release date */}
        {set.releaseDate && (
          <p className="mb-2 text-xs text-muted-foreground">
            {formatReleaseDate(set.releaseDate)}
          </p>
        )}

        {/* Cast */}
        {visibleCast.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {visibleCast.map((contribution) => (
              <span
                key={contribution.id}
                className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
              >
                {getCastName(contribution.person)}
              </span>
            ))}
            {set.contributions.length > 3 && (
              <span className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                +{set.contributions.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
