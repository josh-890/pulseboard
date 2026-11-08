/** One number of a channel's, label's or artist's hero: label, value, an optional line under it */
export function HeroKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-[4.5rem]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[11px] tabular-nums text-muted-foreground">{sub}</p>}
    </div>
  );
}
