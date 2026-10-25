import Link from "next/link";
import { redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { getRatingQueue } from "@/lib/services/rating-queue-service";
import { rateHref } from "@/lib/rating-queue";

export const dynamic = "force-dynamic";

type RateStartPageProps = {
  searchParams: Promise<{ rate?: string }>;
};

// "Rate these" on /sessions and /sets (2026-10-25) lands here: the queue's first
// session opens, or — nothing left to rate — the way back to the list.
export default async function RateStartPage({ searchParams }: RateStartPageProps) {
  const { rate } = await searchParams;
  const queue = await withTenantFromHeaders(() => getRatingQueue(rate, ""));
  if (rate && queue?.nextId) redirect(rateHref(queue.nextId, rate));
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-white/20 bg-card/70 p-6 text-center shadow-sm backdrop-blur-md dark:border-white/10">
      <ListChecks size={28} className="mx-auto text-emerald-500" aria-hidden="true" />
      <h1 className="text-lg font-semibold">Nothing left to rate</h1>
      <p className="text-sm text-muted-foreground">
        {queue ? "Every model in this list has a confirmed intensity." : "This link names no list to rate."}
      </p>
      <Link href={queue?.listHref ?? "/sessions"} className="inline-block text-sm underline underline-offset-2 hover:text-foreground">
        Back to the list
      </Link>
    </div>
  );
}
