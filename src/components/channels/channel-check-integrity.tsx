import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelCheckStagedRow } from "@/components/channels/channel-check-staged-row";
import type { ChannelIntegrity } from "@/lib/services/channel-check-service";

type ChannelCheckIntegrityProps = {
  integrity: ChannelIntegrity;
  /** Channel names of waiting staged sets that the catalogue also writes — listed there instead */
  listedUnderCatalogue: string[];
  channels: { id: string; label: string; description?: string }[];
  labels: { id: string; name: string }[];
};

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon size={16} className={cn("mt-0.5 shrink-0", ok ? "text-emerald-500" : "text-amber-500")} aria-hidden />
      <span>{children}</span>
    </li>
  );
}

/** The rule: no set with an archive folder, and no open staged set, without a channel */
export function ChannelCheckIntegrity({ integrity, listedUnderCatalogue, channels, labels }: ChannelCheckIntegrityProps) {
  const stagedWaiting = integrity.stagedNoChannel.reduce((n, s) => n + s.sets, 0);
  const elsewhere = new Set(listedUnderCatalogue);
  const stagedRows = integrity.stagedNoChannel.filter((s) => !elsewhere.has(s.channelName));
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5 rounded-xl border border-white/15 bg-card/40 px-4 py-3">
        <Rule ok={integrity.archivedNoChannel.length === 0}>
          {integrity.archivedNoChannel.length === 0
            ? "No archived set without a channel"
            : `${integrity.archivedNoChannel.length} archived set(s) without a channel`}
        </Rule>
        <Rule ok={stagedWaiting === 0}>
          {stagedWaiting === 0
            ? `No open staged set without a channel (${integrity.openStaged.toLocaleString()} open)`
            : `${stagedWaiting.toLocaleString()} of ${integrity.openStaged.toLocaleString()} open staged sets without a channel`}
        </Rule>
        <Rule ok={integrity.setsNoChannel === 0}>
          {integrity.setsNoChannel === 0
            ? `Every set has a channel (${integrity.sets.toLocaleString()})`
            : `${integrity.setsNoChannel} of ${integrity.sets.toLocaleString()} sets without a channel`}
        </Rule>
      </ul>

      {integrity.archivedNoChannel.length > 0 && (
        <ul className="space-y-1.5" aria-label="Archived sets without a channel">
          {integrity.archivedNoChannel.map((s) => (
            <li key={s.id} className="rounded-xl border border-white/15 bg-card/40 px-4 py-2 text-sm">
              <Link href={`/sets/${s.id}`} className="font-medium hover:underline focus-visible:underline focus-visible:outline-none">
                {s.title}
              </Link>
              {s.folder && <span className="block text-xs text-muted-foreground">{s.folder}</span>}
            </li>
          ))}
        </ul>
      )}

      {elsewhere.size > 0 && (
        <p className="text-sm text-muted-foreground">
          {elsewhere.size === 1 ? "1 of these channel names is" : `${elsewhere.size} of these channel names are`} also
          written by the catalogue — {elsewhere.size === 1 ? "it is" : "they are"} listed under{" "}
          <a href="#check-catalogue" className="underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
            Catalogue channels
          </a>{" "}
          with everything linking connects there.
        </p>
      )}

      {stagedRows.length > 0 && (
        <ul className="space-y-2" aria-label="Channel names of staged sets without a channel">
          {stagedRows.map((s) => (
            <ChannelCheckStagedRow
              key={s.channelName}
              channelName={s.channelName}
              sets={s.sets}
              channels={channels}
              labels={labels}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
