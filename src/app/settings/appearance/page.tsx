export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import Link from "next/link";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { PaletteSelector } from "@/components/settings/palette-selector";
import { DensitySelector } from "@/components/settings/density-selector";
import { HeroLayoutSelector } from "@/components/settings/hero-layout-selector";
import { HeroBackdropToggle } from "@/components/settings/hero-backdrop-toggle";
import { getHeroBackdropEnabled } from "@/lib/services/setting-service";

export default async function AppearancePage() {
  return withTenantFromHeaders(async () => {
    const heroBackdropEnabled = await getHeroBackdropEnabled();

    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Appearance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customize the look and feel of the interface.
          </p>
        </div>

        <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md dark:border-white/10 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Theme</h2>
            <ThemeToggle />
          </div>

          <div className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Color Palette</h2>
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

          <div className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Display Density</h2>
            <DensitySelector />
          </div>

          <div className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Person Detail Layout</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Choose the information density for the person detail hero card.
            </p>
            <HeroLayoutSelector />
          </div>

          <div className="border-t border-border pt-6">
            <HeroBackdropToggle initialEnabled={heroBackdropEnabled} />
          </div>
        </div>
      </div>
    );
  });
}
