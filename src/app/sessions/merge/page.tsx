import Link from "next/link";
import { ArrowLeft, GitMerge } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { getSessionMergeComparison } from "@/lib/services/session-merge-candidates";
import { SessionMergeWorkspace } from "@/components/sessions/merge-compare";

export const dynamic = "force-dynamic";

// Compare two sessions before merging them (2026-10-20) — opened from the merge
// dialog on a session, or from two sessions selected in /sessions.

type SessionMergePageProps = {
  searchParams: Promise<{ a?: string; b?: string; from?: string }>;
};

/** Back to where the merge started — app paths only */
function backHref(from: string | undefined): string {
  return from && from.startsWith("/") && !from.startsWith("//") ? from : "/sessions";
}

export default async function SessionMergePage({ searchParams }: SessionMergePageProps) {
  return withTenantFromHeaders(async () => {
    const { a, b, from } = await searchParams;
    const comparison = a && b ? await getSessionMergeComparison(a, b) : null;
    const back = backHref(from);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href={back}
            aria-label="Back"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-entity-session/15">
            <GitMerge size={20} className="text-entity-session" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">Compare sessions</h1>
            <p className="text-sm text-muted-foreground">
              Same shoot? The older session stays; the other is merged into it.
            </p>
          </div>
        </div>

        {comparison ? (
          <SessionMergeWorkspace comparison={comparison} />
        ) : (
          <div role="alert" className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <p>These two can&apos;t be compared — pick two different shoot sessions.</p>
            <p className="mt-1 text-xs">One may already have been merged or deleted, or be a person&apos;s reference session.</p>
            <Link href={back} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
              Back
            </Link>
          </div>
        )}
      </div>
    );
  });
}
