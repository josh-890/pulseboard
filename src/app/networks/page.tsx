import { Network } from "lucide-react";
import { getNetworks } from "@/lib/services/network-service";
import { NetworkList } from "@/components/networks/network-list";

export const dynamic = "force-dynamic";

export default async function NetworksPage() {
  const networks = await getNetworks();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
          <Network size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">Networks</h1>
          <p className="text-sm text-muted-foreground">
            {networks.length} {networks.length === 1 ? "network" : "networks"}
          </p>
        </div>
      </div>

      {/* List */}
      <NetworkList networks={networks} />
    </div>
  );
}
