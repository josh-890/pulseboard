export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { findCoverDuplicates } from "@/lib/services/cover-art-cleanup-service";
import { CoverDuplicatesReview } from "@/components/settings/cover-duplicates-review";

/** The reviewed cleanup of cover-art duplicates (ADR-0040) */
export default async function CoverDuplicatesPage() {
  return withTenantFromHeaders(async () => {
    const candidates = await findCoverDuplicates();
    return (
      <div className="max-w-4xl space-y-6">
        <div>
          <Link
            href="/settings/system"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={12} /> System
          </Link>
          <h1 className="text-2xl font-bold">Cover art duplicates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cover-art files that another file of the same set copies — nearly the same picture, with no more pixels.
            Check the list, untick what should stay, then delete. A cover moves to the file that stays.
          </p>
        </div>
        <CoverDuplicatesReview candidates={candidates} />
      </div>
    );
  });
}
