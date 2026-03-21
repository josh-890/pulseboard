import { cn } from "@/lib/utils";

const ACCENT_STYLES = {
  indigo: "border-l-[3px] border-l-indigo-500/60",
  amber: "border-l-[3px] border-l-amber-500/60",
  teal: "border-l-[3px] border-l-teal-500/60",
  rose: "border-l-[3px] border-l-rose-500/60",
} as const;

export function SectionCard({
  title,
  icon,
  children,
  className,
  badge,
  accent,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  badge?: number;
  accent?: keyof typeof ACCENT_STYLES;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm",
        accent && ACCENT_STYLES[accent],
        className,
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
        {badge !== undefined && badge > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {badge}
          </span>
        )}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground/70 italic">{message}</p>;
}

export function InfoRow({ label, value, labelWidth = "w-32" }: { label: string; value: React.ReactNode; labelWidth?: string }) {
  return (
    <div className="flex gap-3">
      <dt className={cn("shrink-0 text-muted-foreground", labelWidth)}>{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
