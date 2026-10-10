import { Bot, CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
import { DISPLAY_TIMEZONE, getAgentStatus } from "@/lib/services/dashboard-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { formatRelativeTime } from "@/lib/utils";

const when = (d: Date) =>
  `${formatRelativeTime(d)} · ${d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TIMEZONE })}`;

// What the agents outside the app last did (2026-10-11): their own run report, or —
// for a run from an older script that does not report — when its effect was last
// seen in the data.
export async function AgentStatus() {
  const agents = await withTenantFromHeaders(() => getAgentStatus());
  return (
    <section
      aria-labelledby="agents-title"
      className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10"
    >
      <h2 id="agents-title" className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Bot size={18} className="text-muted-foreground" aria-hidden="true" /> Agents
      </h2>
      <ul className="space-y-3">
        {agents.map((a) => {
          const Icon = a.last ? (a.last.ok ? CircleCheck : CircleAlert) : CircleDashed;
          const tone = a.last ? (a.last.ok ? "text-emerald-500" : "text-amber-500") : "text-muted-foreground";
          return (
            <li key={a.agent} className="flex gap-2.5">
              <Icon size={16} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{a.label}</p>
                {a.last ? (
                  <>
                    <p className="truncate text-xs text-muted-foreground" title={a.last.summary}>
                      {a.last.summary}
                    </p>
                    <p className="text-xs text-muted-foreground/80">{when(a.last.finishedAt)}</p>
                  </>
                ) : a.lastSeen ? (
                  <p className="text-xs text-muted-foreground">No run report yet · last seen {when(a.lastSeen)}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not run yet</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
