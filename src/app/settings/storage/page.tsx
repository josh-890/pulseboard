export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { ArchiveSettings } from "@/components/settings/archive-settings";
import { getSetting } from "@/lib/services/setting-service";
import {
  ARCHIVE_PHOTOSET_ROOT_KEY,
  ARCHIVE_VIDEOSET_ROOT_KEY,
  ARCHIVE_LAST_SCAN_KEY,
  ARCHIVE_LAST_SCAN_SUMMARY_KEY,
  parseRoots,
} from "@/lib/services/archive-service";

export default async function StoragePage() {
  return withTenantFromHeaders(async () => {
    const [archivePhotosetRoot, archiveVideosetRoot, archiveLastScan, archiveLastScanSummary] =
      await Promise.all([
        getSetting(ARCHIVE_PHOTOSET_ROOT_KEY),
        getSetting(ARCHIVE_VIDEOSET_ROOT_KEY),
        getSetting(ARCHIVE_LAST_SCAN_KEY),
        getSetting(ARCHIVE_LAST_SCAN_SUMMARY_KEY),
      ]);

    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Storage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the root folders for your local photo and video archives.
            These are used to auto-suggest archive paths for sets.
          </p>
        </div>

        <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md dark:border-white/10">
          <ArchiveSettings
            photosetRoots={parseRoots(archivePhotosetRoot)}
            videosetRoots={parseRoots(archiveVideosetRoot)}
          />
          {archiveLastScan && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Last scan:</span>{" "}
                {new Date(archiveLastScan).toLocaleString()}
              </p>
              {archiveLastScanSummary && (
                <p className="mt-0.5 text-xs text-muted-foreground">{archiveLastScanSummary}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  });
}
