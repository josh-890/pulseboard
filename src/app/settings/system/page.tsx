import Link from "next/link";
import { BookImage, ChevronRight, TriangleAlert } from "lucide-react";
import { DatabaseMaintenance } from "@/components/settings/database-maintenance";

export default function SystemPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">System</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin operations for database maintenance and storage consistency.
        </p>
      </div>

      <Link
        href="/settings/system/cover-duplicates"
        className="flex items-center gap-3 rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm transition-colors hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BookImage size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Cover art duplicates</span>
          <span className="block text-xs text-muted-foreground">
            Stand-ins and second copies of a set&apos;s cover art — review side by side, then delete
          </span>
        </span>
        <ChevronRight size={16} className="text-muted-foreground" aria-hidden="true" />
      </Link>

      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 shadow-lg">
        <div className="mb-5 flex items-start gap-3">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-destructive">Admin Operations</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The following operations can permanently delete data. Results are shown
              before any deletions occur, but actions cannot be undone.
            </p>
          </div>
        </div>
        <DatabaseMaintenance />
      </div>
    </div>
  );
}
