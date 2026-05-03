import { TriangleAlert } from "lucide-react";
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
