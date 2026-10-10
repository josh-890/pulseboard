import Link from "next/link";
import { Bot, FolderPlus, ImagePlus, Import, Rocket, ScrollText, UserPlus } from "lucide-react";
import { DISPLAY_TIMEZONE, getDashboardActivity, type ActivityKind } from "@/lib/services/dashboard-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";

const ICON: Record<ActivityKind, { icon: typeof Bot; className: string }> = {
  promoted: { icon: Rocket, className: "bg-emerald-500/15 text-emerald-500" },
  images: { icon: ImagePlus, className: "bg-sky-500/15 text-sky-500" },
  folders: { icon: FolderPlus, className: "bg-violet-500/15 text-violet-500" },
  person: { icon: UserPlus, className: "bg-pink-500/15 text-pink-500" },
  import: { icon: Import, className: "bg-amber-500/15 text-amber-500" },
  agent: { icon: Bot, className: "bg-slate-500/15 text-slate-500" },
  logged: { icon: ScrollText, className: "bg-muted text-muted-foreground" },
};

const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIMEZONE }).format(d);

function dayLabel(day: string): string {
  if (day === dayOf(new Date())) return "Today";
  if (day === dayOf(new Date(Date.now() - 86_400_000))) return "Yesterday";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TIMEZONE });

// What happened, by day (2026-10-11) — derived from the records themselves:
// promotions, images added (agent or by hand), new archive folders, new people,
// imports, agent runs. Nothing has to remember to write a log entry.
export async function DashboardActivity() {
  const days = await withTenantFromHeaders(() => getDashboardActivity(14));
  return (
    <section
      aria-labelledby="activity-title"
      className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10"
    >
      <h2 id="activity-title" className="mb-4 text-lg font-semibold">
        Activity <span className="text-sm font-normal text-muted-foreground">· last 14 days</span>
      </h2>
      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing happened in the last two weeks.</p>
      ) : (
        <div className="space-y-5">
          {days.map(({ day, events }) => (
            <div key={day}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{dayLabel(day)}</h3>
              <ul className="space-y-1">
                {events.slice(0, 25).map((e, i) => {
                  const { icon: Icon, className } = ICON[e.kind];
                  const body = (
                    <>
                      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", className)} aria-hidden="true">
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{e.title}</span>
                        {e.detail && <span className="block truncate text-xs text-muted-foreground">{e.detail}</span>}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{time(e.time)}</span>
                    </>
                  );
                  return (
                    <li key={`${e.kind}-${i}`}>
                      {e.href ? (
                        <Link
                          href={e.href}
                          className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-2 py-1.5">{body}</div>
                      )}
                    </li>
                  );
                })}
                {events.length > 25 && <li className="px-2 text-xs text-muted-foreground">… and {events.length - 25} more that day</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
