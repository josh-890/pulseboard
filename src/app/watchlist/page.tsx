export const dynamic = "force-dynamic";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { getWatchlist } from "@/lib/services/person-service";
import { WatchlistClient } from "@/components/watchlist/watchlist-client";

export default async function WatchlistPage() {
  return withTenantFromHeaders(async () => {
    const entries = await getWatchlist();
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Watchlist</h1>
          <span className="text-sm text-muted-foreground">
            {entries.length} {entries.length === 1 ? "person" : "people"} monitored
          </span>
        </div>
        <WatchlistClient entries={entries} />
      </div>
    );
  });
}
