export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { findCoverCheck } from "@/lib/services/cover-check-service";
import { CoverCheckReview } from "@/components/settings/cover-check-review";

/** Sets whose automatic cover is not their best cover art (ADR-0040 addendum) */
export default async function CoverCheckPage() {
  return withTenantFromHeaders(async () => {
    const rows = await findCoverCheck();
    return (
      <div className="max-w-4xl space-y-6">
        <div>
          <Link
            href="/settings/system"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={12} /> System
          </Link>
          <h1 className="text-2xl font-bold">Cover check</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sets whose cover was picked automatically while a better cover art file is there — the publisher&apos;s
            <code className="mx-1">Title-c</code> before <code className="mx-1">Title-c1</code>, before the cover carried
            over from the import, before a photo. Ticked sets switch to the cover art; the others keep their cover and
            it counts as picked by hand from then on. A cover you picked is never listed.
          </p>
        </div>
        <CoverCheckReview rows={rows} />
      </div>
    );
  });
}
