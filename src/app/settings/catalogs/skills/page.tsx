export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { SkillCatalogManager } from "@/components/settings/skill-catalog-manager";
import { SkillLevelConfig } from "@/components/settings/skill-level-config";
import { getAllSkillGroups } from "@/lib/services/skill-catalog-service";
import { getSkillLevelConfigs } from "@/lib/services/setting-service";

export default async function SkillsPage() {
  return withTenantFromHeaders(async () => {
    const [skillGroups, skillLevelConfigs] = await Promise.all([
      getAllSkillGroups(),
      getSkillLevelConfigs(),
    ]);

    return (
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Skills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define skill groups and individual skills, and configure how skill levels
            affect the Weighted CP calculation.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold">Skill Catalog</h2>
          <p className="text-sm text-muted-foreground">
            Define skill groups and individual skills used to track person skill development
            and session participation.
          </p>
          <SkillCatalogManager groups={skillGroups} />
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold">Skill Level Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Customize skill level names and delta adjustments for the Weighted CP
            calculation. WCP per skill = pgrade + delta (capped at 10).
          </p>
          <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md dark:border-white/10">
            <SkillLevelConfig configs={skillLevelConfigs} />
          </div>
        </div>
      </div>
    );
  });
}
