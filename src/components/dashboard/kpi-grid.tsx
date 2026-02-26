import { Users, ImageIcon, Building2, Radio, FolderKanban, AlertCircle } from "lucide-react";
import { getDashboardStats } from "@/lib/services/stats-service";
import { KpiCard } from "./kpi-card";

export async function KpiGrid() {
  const stats = await getDashboardStats();

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
      <KpiCard
        label="People"
        value={stats.persons}
        icon={<Users size={20} />}
        href="/people"
      />
      <KpiCard
        label="Sets"
        value={stats.sets}
        icon={<ImageIcon size={20} />}
        href="/sets"
      />
      <KpiCard
        label="Labels"
        value={stats.labels}
        icon={<Building2 size={20} />}
        href="/labels"
      />
      <KpiCard
        label="Channels"
        value={stats.channels}
        icon={<Radio size={20} />}
        href="/channels"
      />
      <KpiCard
        label="Projects"
        value={stats.projects}
        icon={<FolderKanban size={20} />}
        href="/projects"
      />
      {stats.unresolvedCredits > 0 && (
        <KpiCard
          label="Unresolved Credits"
          value={stats.unresolvedCredits}
          icon={<AlertCircle size={20} />}
          href="/sets"
        />
      )}
    </div>
  );
}
