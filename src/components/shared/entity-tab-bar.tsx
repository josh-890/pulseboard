import Link from "next/link";
import { cn } from "@/lib/utils";

export type EntityTab = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** A number beside the label (sets, models …) */
  count?: number;
  /** An amber dot: something here wants attention */
  attention?: boolean;
};

type EntityTabBarProps = {
  tabs: EntityTab[];
  active: string;
  /** The page's path; a tab adds ?tab=key (the first tab is the bare path) */
  basePath: string;
  className?: string;
};

/**
 * The tab bar of the channel, label and artist pages — the person page's look,
 * but each tab is a link (?tab=), so the server renders only the open one and a
 * tab can be bookmarked or shared.
 */
export function EntityTabBar({ tabs, active, basePath, className }: EntityTabBarProps) {
  return (
    <nav aria-label="Sections" className={cn("overflow-x-auto scrollbar-none", className)}>
      <ul className="inline-flex min-w-full gap-1 rounded-xl border border-white/15 bg-card/50 p-1 sm:min-w-0">
        {tabs.map((tab, i) => {
          const isActive = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={i === 0 ? basePath : `${basePath}?tab=${tab.key}`}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
                {tab.label}
                {tab.count !== undefined && (
                  <span className="rounded-full bg-muted/60 px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {tab.count.toLocaleString()}
                  </span>
                )}
                {tab.attention && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="needs attention" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
