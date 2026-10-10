import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { getNeedsYou } from "@/lib/services/dashboard-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

const fmt = (n: number) => n.toLocaleString("en-US");

// The queues waiting for a decision or a run (2026-10-11) — each with its count and
// a link straight into it. Empty queues are not shown.
export async function NeedsYou() {
  const items = await withTenantFromHeaders(() => getNeedsYou());
  return (
    <section
      aria-labelledby="needs-you-title"
      className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10"
    >
      <h2 id="needs-you-title" className="mb-3 text-lg font-semibold">
        Needs you
      </h2>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 size={16} className="text-emerald-500" aria-hidden="true" /> Nothing is waiting.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.key}>
              <Link
                href={it.href}
                className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-[3.5rem] rounded-md bg-primary/10 px-2 py-0.5 text-right text-sm font-semibold tabular-nums text-primary">
                  {fmt(it.count)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{it.label}</span>
                  {it.hint && <span className="block text-xs text-muted-foreground">{it.hint}</span>}
                </span>
                <ArrowRight size={14} className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              </Link>
              {it.items && it.items.length > 0 && (
                <ul className="mb-1 ml-[4.75rem] space-y-0.5">
                  {it.items.map((s) => (
                    <li key={s.href} className="text-xs">
                      <Link href={s.href} className="hover:underline">
                        {s.label}
                      </Link>
                      {s.detail && <span className="block truncate text-muted-foreground">{s.detail}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
