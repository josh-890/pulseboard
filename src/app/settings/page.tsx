export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import Link from "next/link";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { PaletteSelector } from "@/components/settings/palette-selector";
import { DensitySelector } from "@/components/settings/density-selector";
import { HeroLayoutSelector } from "@/components/settings/hero-layout-selector";
import { HeroBackdropToggle } from "@/components/settings/hero-backdrop-toggle";
import { ProfileImageLabels } from "@/components/settings/profile-image-labels";
import { MediaCategoryManager } from "@/components/settings/media-category-manager";
import { ContributionRoleManager } from "@/components/settings/contribution-role-manager";
import { SkillCatalogManager } from "@/components/settings/skill-catalog-manager";
import { SkillLevelConfig } from "@/components/settings/skill-level-config";
import { PhysicalAttributeManager } from "@/components/settings/physical-attribute-manager";
import { TagSettingsSection } from "@/components/settings/tag-settings-section";
import { DatabaseMaintenance } from "@/components/settings/database-maintenance";
import { getProfileImageLabels, getSkillLevelConfigs, getHeroBackdropEnabled, getSetting } from "@/lib/services/setting-service";
import { ARCHIVE_PHOTOSET_ROOT_KEY, ARCHIVE_VIDEOSET_ROOT_KEY } from "@/lib/services/archive-service";
import { ArchiveSettings } from "@/components/settings/archive-settings";
import { getAllCategoryGroups } from "@/lib/services/category-service";
import { getAllSkillGroups } from "@/lib/services/skill-catalog-service";
import { getAllContributionRoleGroups } from "@/lib/services/contribution-role-service";
import { getAllPhysicalAttributeGroups } from "@/lib/services/physical-attribute-catalog-service";
import {
  getAllTagGroups,
  getPendingTags,
  getOrphanedTags,
  getNearDuplicateTags,
  getTagUsageBreakdown,
} from "@/lib/services/tag-service";

export default async function SettingsPage() {
  return withTenantFromHeaders(async () => {
    const [labels, categoryGroups, skillGroups, skillLevelConfigs, roleGroups, physicalAttributeGroups, tagGroups, pendingTags, orphanedTags, nearDuplicates, usageBreakdown, heroBackdropEnabled, archivePhotosetRoot, archiveVideosetRoot] = await Promise.all([
    getProfileImageLabels(),
    getAllCategoryGroups(),
    getAllSkillGroups(),
    getSkillLevelConfigs(),
    getAllContributionRoleGroups(),
    getAllPhysicalAttributeGroups(),
    getAllTagGroups(),
    getPendingTags(),
    getOrphanedTags(),
    getNearDuplicateTags(),
    getTagUsageBreakdown(),
    getHeroBackdropEnabled(),
    getSetting(ARCHIVE_PHOTOSET_ROOT_KEY),
    getSetting(ARCHIVE_VIDEOSET_ROOT_KEY),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold">Settings</h1>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-4 text-lg font-semibold">Appearance</h2>
        <ThemeToggle />
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-3 text-sm font-medium">Color Palette</h3>
          <PaletteSelector />
          <div className="mt-3">
            <Link
              href="/preview/palettes"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Preview palettes side-by-side
            </Link>
          </div>
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <HeroBackdropToggle initialEnabled={heroBackdropEnabled} />
        </div>
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-4 text-lg font-semibold">Display Density</h2>
        <DensitySelector />
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-2 text-lg font-semibold">Person Detail Layout</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Choose the information density for the person detail hero card.
        </p>
        <HeroLayoutSelector />
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-4 text-lg font-semibold">Profile Image Slots</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Customize the display names for each profile image slot. These labels
          appear in the slot selector on the People page.
        </p>
        <ProfileImageLabels labels={labels} />
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-4 text-lg font-semibold">Media Categories</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Organize photo documentation by category. Categories with an entity model
          link photos to specific body marks, modifications, or procedures.
        </p>
        <MediaCategoryManager groups={categoryGroups} />
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-4 text-lg font-semibold">Contribution Roles</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Define role categories for session contributions and set credits (e.g. Model, Photographer).
        </p>
        <ContributionRoleManager groups={roleGroups} />
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-4 text-lg font-semibold">Physical Attribute Catalog</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Define physical attribute groups and measurements. These are used to track
          extensible physical attributes over time via persona snapshots.
        </p>
        <PhysicalAttributeManager groups={physicalAttributeGroups} />
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-4 text-lg font-semibold">Skill Catalog</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Define skill groups and individual skills. These are used to track
          person skill development and session participation.
        </p>
        <SkillCatalogManager groups={skillGroups} />
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-4 text-lg font-semibold">Skill Level Configuration</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Customize skill level names and delta adjustments for the Weighted CP
          calculation. WCP per skill = pgrade + delta (capped at 10).
        </p>
        <SkillLevelConfig configs={skillLevelConfigs} />
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-4 text-lg font-semibold">Tag Catalog</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Define tag groups and tags. Tags can be applied to people, sessions, media items, sets,
          and projects. Each group has a color; each tag has a configurable scope.
        </p>
        <TagSettingsSection
          groups={tagGroups}
          pendingTags={pendingTags}
          orphanedTags={orphanedTags}
          nearDuplicates={nearDuplicates}
          usageBreakdown={usageBreakdown}
        />
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-2 text-lg font-semibold">Archive Storage</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Configure the root folders for your local photo and video archives.
          These are used to auto-suggest archive paths for sets.
        </p>
        <ArchiveSettings
          photosetRoot={archivePhotosetRoot ?? ""}
          videosetRoot={archiveVideosetRoot ?? ""}
        />
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-2 text-lg font-semibold">Manage Database</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Run consistency checks and cleanup operations. Deletions are
          permanent.
        </p>
        <DatabaseMaintenance />
      </div>
    </div>
    );
  });
}
