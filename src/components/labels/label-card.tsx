import Link from "next/link";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { getLabels } from "@/lib/services/label-service";

type LabelItem = Awaited<ReturnType<typeof getLabels>>[number];

type LabelCardProps = {
  label: LabelItem;
};

export function LabelCard({ label }: LabelCardProps) {
  const visibleNetworks = label.networks.slice(0, 2);

  return (
    <Link
      href={`/labels/${label.id}`}
      className="group block focus-visible:outline-none"
    >
      <div
        className={cn(
          "rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm",
          "transition-all duration-200",
          "hover:border-white/30 hover:bg-card/90 hover:shadow-lg hover:-translate-y-0.5",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
        )}
      >
        {/* Icon + name */}
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Building2 size={16} className="text-primary" />
          </div>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">
            {label.name}
          </h3>
        </div>

        {/* Count badges */}
        <div className="mb-2.5 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/60 px-2.5 py-0.5 font-medium text-muted-foreground">
            {label.channels.length}{" "}
            {label.channels.length === 1 ? "channel" : "channels"}
          </span>
          <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/60 px-2.5 py-0.5 font-medium text-muted-foreground">
            {label.projects.length}{" "}
            {label.projects.length === 1 ? "project" : "projects"}
          </span>
        </div>

        {/* Networks */}
        {visibleNetworks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visibleNetworks.map(({ network }) => (
              <span
                key={network.id}
                className="inline-flex items-center rounded-full border border-white/10 bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
              >
                {network.name}
              </span>
            ))}
            {label.networks.length > 2 && (
              <span className="inline-flex items-center rounded-full border border-white/10 bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                +{label.networks.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
