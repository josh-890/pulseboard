import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PersonDigitalIdentityItem } from "@/lib/types";

type DigitalIdentityRowProps = {
  identity: PersonDigitalIdentityItem;
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  inactive: "bg-slate-500/15 text-slate-500 border-slate-500/30",
  suspended: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  deleted: "bg-red-500/15 text-red-500 border-red-500/30",
};

export function DigitalIdentityRow({ identity }: DigitalIdentityRowProps) {
  const statusStyle = STATUS_STYLES[identity.status] ?? STATUS_STYLES.inactive;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-card/40 px-4 py-3">
      <div className="w-24 shrink-0 text-sm font-medium text-foreground/80">
        {identity.platform}
      </div>

      <div className="min-w-0 flex-1">
        {identity.handle && (
          <p className="truncate text-sm font-medium">{identity.handle}</p>
        )}
        {identity.url && (
          <a
            href={identity.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {identity.url}
            <ExternalLink size={10} className="shrink-0" />
          </a>
        )}
        {!identity.handle && !identity.url && (
          <span className="text-xs text-muted-foreground/50 italic">No details</span>
        )}
      </div>

      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
          statusStyle,
        )}
      >
        {identity.status}
      </span>
    </div>
  );
}
