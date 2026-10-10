import Link from "next/link";
import { Archive, Clapperboard, ImageIcon, Images, Layers, Users } from "lucide-react";
import { getDashboardKpis } from "@/lib/services/dashboard-service";
import { getUnresolvedCreditCount } from "@/lib/services/stats-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { KpiCard } from "./kpi-card";

const fmt = (n: number) => n.toLocaleString("en-US");

// Library and pipeline at a glance (2026-10-11): counted live, not from the old
// snapshot view that lagged between deploys. The reference catalogue (labels,
// channels, projects) sits in a small line underneath.
export async function KpiGrid() {
  const [k, unresolved] = await withTenantFromHeaders(() => Promise.all([getDashboardKpis(), getUnresolvedCreditCount()]));
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const small = [
    { label: plural(k.labels, "label", "labels"), n: k.labels, href: "/labels" },
    { label: plural(k.channels, "channel", "channels"), n: k.channels, href: "/channels" },
    { label: plural(k.projects, "project", "projects"), n: k.projects, href: "/projects" },
    ...(unresolved > 0 ? [{ label: plural(unresolved, "unresolved credit", "unresolved credits"), n: unresolved, href: "/sets" }] : []),
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="People" value={fmt(k.persons)} icon={<Users size={20} />} href="/people" />
        <KpiCard label="Sets" value={fmt(k.sets)} icon={<ImageIcon size={20} />} href="/sets" />
        <KpiCard label="Sessions" value={fmt(k.sessions)} icon={<Clapperboard size={20} />} href="/sessions" />
        <KpiCard label="Images" value={fmt(k.images)} icon={<Images size={20} />} href="/favorites" />
        <KpiCard label="Staged sets" value={fmt(k.staged)} icon={<Layers size={20} />} href="/staging-sets" />
        <KpiCard label="Unlinked folders" value={fmt(k.orphanFolders)} icon={<Archive size={20} />} href="/archive" />
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        {small.map((s) => (
          <Link key={s.label} href={s.href} className="transition-colors hover:text-foreground hover:underline">
            <span className="tabular-nums">{fmt(s.n)}</span> {s.label}
          </Link>
        ))}
      </p>
    </div>
  );
}
