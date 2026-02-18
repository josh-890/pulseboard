export const dynamic = "force-dynamic";

import Link from "next/link";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { PaletteSelector } from "@/components/settings/palette-selector";
import { DensitySelector } from "@/components/settings/density-selector";
import { ProfileImageLabels } from "@/components/settings/profile-image-labels";
import { getProfileImageLabels } from "@/lib/services/setting-service";

export default async function SettingsPage() {
  const labels = await getProfileImageLabels();

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
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-4 text-lg font-semibold">Display Density</h2>
        <DensitySelector />
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-4 text-lg font-semibold">Profile Image Slots</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Customize the display names for each profile image slot. These labels
          appear in the slot selector on the People page.
        </p>
        <ProfileImageLabels labels={labels} />
      </div>
    </div>
  );
}
