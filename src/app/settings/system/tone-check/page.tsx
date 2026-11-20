export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { findToneCheck } from "@/lib/services/tone-service";
import { ToneCheckReview } from "@/components/settings/tone-check-review";

/** Photos close to the color / B&W line, not decided by hand yet (ADR-0041) */
export default async function ToneCheckPage() {
  return withTenantFromHeaders(async () => {
    const { items, total } = await findToneCheck();
    return (
      <div className="max-w-5xl space-y-6">
        <div>
          <Link
            href="/settings/system"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={12} /> System
          </Link>
          <h1 className="text-2xl font-bold">Tone check</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Photos the measurement can&apos;t tell for sure — toned prints (sepia), very pale or nearly grey color. Each
            shows what was measured; tap the ones that are wrong, then save. Every photo here is saved as decided by
            hand and leaves the list.
          </p>
        </div>
        <ToneCheckReview items={items} total={total} />
      </div>
    );
  });
}
