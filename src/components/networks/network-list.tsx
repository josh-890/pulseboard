import { Network } from "lucide-react";
import { NetworkCard } from "./network-card";
import type { getNetworks } from "@/lib/services/network-service";

type NetworkListProps = {
  networks: Awaited<ReturnType<typeof getNetworks>>;
};

export function NetworkList({ networks }: NetworkListProps) {
  if (networks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Network size={48} className="mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">No networks found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {networks.map((network) => (
        <NetworkCard key={network.id} network={network} />
      ))}
    </div>
  );
}
