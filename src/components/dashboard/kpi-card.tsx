import Link from "next/link";

type KpiCardProps = {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  href?: string;
};

export function KpiCard({ label, value, icon, href }: KpiCardProps) {
  const inner = (
    <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md transition-colors hover:bg-card/90 dark:border-white/10">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}
