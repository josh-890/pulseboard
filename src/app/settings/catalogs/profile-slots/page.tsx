export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { ProfileImageLabels } from "@/components/settings/profile-image-labels";
import { getProfileImageLabels } from "@/lib/services/setting-service";

export default async function ProfileSlotsPage() {
  return withTenantFromHeaders(async () => {
    const labels = await getProfileImageLabels();

    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Profile Image Slots</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customize the display names for each profile image slot. These labels
            appear in the slot selector on the People page.
          </p>
        </div>
        <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md dark:border-white/10">
          <ProfileImageLabels labels={labels} />
        </div>
      </div>
    );
  });
}
