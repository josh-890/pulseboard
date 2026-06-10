import { withTenantFromHeaders } from "@/lib/tenant-context";
import { getAllScrapeSources } from "@/lib/services/scrape-source-service";
import { getScanCadenceDays } from "@/lib/services/scan-service";
import { ScanSettingsClient } from "@/components/settings/scan-settings-client";

export default async function ScanningSettingsPage() {
  return withTenantFromHeaders(async () => {
    const [sources, cadence] = await Promise.all([
      getAllScrapeSources(),
      getScanCadenceDays(),
    ]);
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold">Scanning</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scrape sources feed the watchlist scan-round builder. Only{" "}
            <span className="font-medium">scannable</span> platforms produce URL files;
            mark a platform scannable only if its scraper emits ICG-ID-attributable
            import files.
          </p>
        </div>
        <ScanSettingsClient
          sources={sources.map((s) => ({
            id: s.id,
            key: s.key,
            displayName: s.displayName,
            domains: s.domains,
            isScannable: s.isScannable,
            fileName: s.fileName,
            lineFormat: s.lineFormat,
            sortOrder: s.sortOrder,
          }))}
          cadence={cadence}
        />
      </div>
    );
  });
}
