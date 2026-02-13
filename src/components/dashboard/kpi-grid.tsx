import { FolderKanban, Zap, PauseCircle, CheckCircle2 } from "lucide-react";
import { getDashboardStats } from "@/lib/services/stats-service";
import { KpiCard } from "./kpi-card";

export function KpiGrid() {
  const stats = getDashboardStats();

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard
        label="Total Projects"
        value={stats.total}
        icon={<FolderKanban size={20} />}
      />
      <KpiCard
        label="Active"
        value={stats.active}
        icon={<Zap size={20} />}
      />
      <KpiCard
        label="Paused"
        value={stats.paused}
        icon={<PauseCircle size={20} />}
      />
      <KpiCard
        label="Done"
        value={stats.done}
        icon={<CheckCircle2 size={20} />}
      />
    </div>
  );
}
