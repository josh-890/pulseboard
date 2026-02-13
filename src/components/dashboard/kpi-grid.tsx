import {
  FolderKanban,
  Zap,
  PauseCircle,
  CheckCircle2,
  Users,
} from "lucide-react";
import { getDashboardStats, getPeopleStats } from "@/lib/services/stats-service";
import { KpiCard } from "./kpi-card";

export function KpiGrid() {
  const stats = getDashboardStats();
  const peopleStats = getPeopleStats();

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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
      <KpiCard
        label="Team Members"
        value={peopleStats.totalPeople}
        icon={<Users size={20} />}
      />
    </div>
  );
}
