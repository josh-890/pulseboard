export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { getMotifTemplates } from "@/lib/services/motif-template-service";
import { getProfileImageLabels } from "@/lib/services/setting-service";
import { MotifTemplatesCatalog } from "@/components/settings/motif-templates-catalog";

export default async function MotifTemplatesPage() {
  return withTenantFromHeaders(async () => {
    const [templates, slotLabels] = await Promise.all([getMotifTemplates(), getProfileImageLabels()]);

    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Motif Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define standardized motifs per profile slot — the output aspect and the target
            keypoint positions an aligned image must hit (e.g. eye-line/zoom for headshots),
            so the same motif is framed identically across people. Used by the
            &ldquo;Standardize&rdquo; aligner on a person&rsquo;s Photos tab.
          </p>
        </div>
        <MotifTemplatesCatalog
          templates={templates}
          slotLabels={slotLabels.map((l, i) => ({ slot: i + 1, label: l.label }))}
        />
      </div>
    );
  });
}
