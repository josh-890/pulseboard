"use client";

import { useState, useTransition } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ImageOff,
  Copy,
  Link2Off,
  RefreshCw,
  HardDrive,
  Trash2,
  Users,
  Flag,
  Database,
  ShieldCheck,
  Fingerprint,
  ImageOff as ImageOffIcon,
  RadioTower,
  UserSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fixOrphanedMediaAction,
  fixDuplicateMediaAction,
  fixDuplicateLinksAction,
  refreshViewsAction,
  auditMinioConsistencyAction,
  processOrphanedStorageKeysAction,
  reconcileStagingSetParticipantsAction,
  fixImportedNationalityCodesAction,
  rebuildCurrentStateCacheAction,
  checkCurrentStateIntegrityAction,
  auditIcgIdOriginsAction,
  auditArchiveCoversAction,
  checkUndefinedArchiveChannelsAction,
  auditCatalogueAvatarsAction,
} from "@/lib/actions/database-maintenance-actions";

type ActionResult = {
  success: boolean;
  error?: string;
  found?: number;
  fixed?: number;
  details?: string[];
};

type ActionConfig = {
  title: string;
  description: string;
  icon: React.ReactNode;
  action: () => Promise<ActionResult>;
};

const actions: ActionConfig[] = [
  {
    title: "Orphaned Media Items",
    description:
      "Find MediaItems with no file variants (broken uploads). Deletes orphans and their person links.",
    icon: <ImageOff className="h-5 w-5 text-muted-foreground" />,
    action: fixOrphanedMediaAction,
  },
  {
    title: "Duplicate Media Files",
    description:
      "Find identical files (same hash) uploaded multiple times to the same session. Keeps the oldest, reassigns links, deletes extras.",
    icon: <Copy className="h-5 w-5 text-muted-foreground" />,
    action: fixDuplicateMediaAction,
  },
  {
    title: "Duplicate Person-Media Links",
    description:
      "Find duplicate PersonMediaLink rows (same person + media). Keeps the oldest, deletes extras.",
    icon: <Link2Off className="h-5 w-5 text-muted-foreground" />,
    action: fixDuplicateLinksAction,
  },
  {
    title: "MinIO Storage Consistency",
    description:
      "Cross-check every media item's variant files against MinIO storage. Finds and removes DB rows whose files are entirely missing (e.g. victims of the shallow-copy bug). Reports orphan MinIO objects.",
    icon: <HardDrive className="h-5 w-5 text-muted-foreground" />,
    action: auditMinioConsistencyAction,
  },
  {
    title: "Orphaned Storage Keys",
    description:
      "Retry deleting MinIO files that failed to clean up when media was deleted. Marks retried keys as resolved.",
    icon: <Trash2 className="h-5 w-5 text-muted-foreground" />,
    action: processOrphanedStorageKeysAction,
  },
  {
    title: "Refresh Materialized Views",
    description:
      "Refresh all materialized views (dashboard stats, affiliations). Safe to run anytime.",
    icon: <RefreshCw className="h-5 w-5 text-muted-foreground" />,
    action: refreshViewsAction,
  },
  {
    title: "Rebuild Current-State Cache",
    description:
      "Rebuild the PersonCurrentState cache for every person from scratch. Run after bulk operations or a colour-catalog change. Safe to run anytime.",
    icon: <Database className="h-5 w-5 text-muted-foreground" />,
    action: rebuildCurrentStateCacheAction,
  },
  {
    title: "Current-State Cache Integrity",
    description:
      "Recompute every PersonCurrentState row and report any that had drifted from their correct value. A drift means a write path skipped the recompute — a bug. Self-healing.",
    icon: <ShieldCheck className="h-5 w-5 text-muted-foreground" />,
    action: checkCurrentStateIntegrityAction,
  },
  {
    title: "Nationality Codes → IOC",
    description:
      "Canonical nationality format is the 3-letter IOC code (e.g. 'GER', 'USA'). Find persons whose nationality is still stored as a 2-letter ISO code (e.g. 'DE') or other non-IOC value and convert them to IOC so the nationality picker, import, and edit form agree.",
    icon: <Flag className="h-5 w-5 text-muted-foreground" />,
    action: fixImportedNationalityCodesAction,
  },
  {
    title: "Staging Set Participant ICG-IDs",
    description:
      "Verify all staging set participant ICG-IDs are consistent. Auto-fixes stale subjectIcgId references and re-syncs participantIcgIds with the participants list. Unmatched participants with a name match are reported as candidates only — never auto-applied. Runs a full participant status refresh at the end.",
    icon: <Users className="h-5 w-5 text-muted-foreground" />,
    action: reconcileStagingSetParticipantsAction,
  },
  {
    title: "ICG-ID Origins",
    description:
      "Report how many people carry an external ICG-ID versus one self-assigned here (marked by '@'), and flag any ICG-ID matching neither shape — a marker in the wrong position, or an import-polluted value. Also flags contacts carrying the reserved marker, which should be impossible. Read-only: fix anything it finds via the Change ICG-ID dialog so the staging cascades run.",
    icon: <Fingerprint className="h-5 w-5 text-muted-foreground" />,
    action: auditIcgIdOriginsAction,
  },
  {
    title: "Archive Cover Coverage",
    description:
      "How many archive folders have a cover thumbnail, and which ones failed. The cover agent fails one folder at a time and records why, so a single corrupt image never derails a full run \u2014 this is where those failures become actionable. Read-only: clean or re-encode the listed files, then re-run archive-cover.ps1 -RetryFailed.",
    icon: <ImageOffIcon className="h-5 w-5 text-muted-foreground" />,
    action: auditArchiveCoversAction,
  },
  {
    title: "Undefined Archive Channels",
    description:
      "Which archive short codes have no Channel behind them. This is not a coverage gap — the catalogue join keys on date and title, so those folders still get suggestions. It is a guard gap: the cross-label check resolves the code to a Channel to find its owning Label, and an unresolvable code makes that check pass silently. Also flags channels missing a short code or an owning Label, which break the same guard. Read-only: define the channel, then re-run catalogue-join.ts --post.",
    icon: <RadioTower className="h-5 w-5 text-muted-foreground" />,
    action: checkUndefinedArchiveChannelsAction,
  },
  {
    title: "Catalogue Portraits",
    description:
      "How many person portraits from the catalogue are stored, and which ones could not be read. The workbench compares an archive cover against a person's face; before these were imported 84% of suggested identities had none. The agent fails one person at a time and records why, so one corrupt file never derails a 39,000-image run \u2014 this is where those failures become actionable. Read-only: clean or re-encode the listed files, then re-run catalogue-avatar.ps1 -RetryFailed.",
    icon: <UserSquare className="h-5 w-5 text-muted-foreground" />,
    action: auditCatalogueAvatarsAction,
  },
];

function ActionCard({ config }: { config: ActionConfig }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRun() {
    setResult(null);
    setExpanded(false);
    startTransition(async () => {
      const res = await config.action();
      setResult(res);
    });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{config.icon}</div>
        <div className="flex-1">
          <h3 className="text-sm font-medium">{config.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {config.description}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRun}
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Running…
            </>
          ) : (
            "Run Check"
          )}
        </Button>
      </div>

      {result && (
        <div className="mt-3">
          {!result.success ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mr-1.5 inline-block h-4 w-4" />
              Error: {result.error}
            </div>
          ) : result.found === 0 ? (
            <div className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">
              <CheckCircle2 className="mr-1.5 inline-block h-4 w-4" />
              No issues found
              {/* Read-only audits (e.g. ICG-ID Origins) report their findings in
                  `details` even when nothing is wrong — the split IS the output,
                  so it must stay reachable on a clean run. */}
              {result.details && result.details.length > 0 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="ml-2 inline-flex items-center text-xs underline underline-offset-2 hover:no-underline"
                >
                  {expanded ? (
                    <ChevronDown className="mr-0.5 h-3 w-3" />
                  ) : (
                    <ChevronRight className="mr-0.5 h-3 w-3" />
                  )}
                  Details
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              <CheckCircle2 className="mr-1.5 inline-block h-4 w-4" />
              Found {result.found}, fixed {result.fixed}
              {result.details && result.details.length > 0 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="ml-2 inline-flex items-center text-xs underline underline-offset-2 hover:no-underline"
                >
                  {expanded ? (
                    <ChevronDown className="mr-0.5 h-3 w-3" />
                  ) : (
                    <ChevronRight className="mr-0.5 h-3 w-3" />
                  )}
                  Details
                </button>
              )}
            </div>
          )}

          {result.details && result.details.length > 0 && expanded && (
            <ul className="mt-2 space-y-0.5 pl-4 text-xs text-muted-foreground">
              {result.details.map((detail, i) => (
                <li key={i} className="list-disc">
                  {detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function DatabaseMaintenance() {
  return (
    <div className="space-y-3">
      {actions.map((config) => (
        <ActionCard key={config.title} config={config} />
      ))}
    </div>
  );
}
