"use client";

import { useState, useTransition } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ImageOff,
  Link2Off,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fixOrphanedMediaAction,
  fixDuplicateLinksAction,
  refreshViewsAction,
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
      "Find MediaItems with no file variants (broken uploads). Soft-deletes orphans and their person links.",
    icon: <ImageOff className="h-5 w-5 text-muted-foreground" />,
    action: fixOrphanedMediaAction,
  },
  {
    title: "Duplicate Person-Media Links",
    description:
      "Find duplicate PersonMediaLink rows (same person + media). Keeps the oldest, soft-deletes extras.",
    icon: <Link2Off className="h-5 w-5 text-muted-foreground" />,
    action: fixDuplicateLinksAction,
  },
  {
    title: "Refresh Materialized Views",
    description:
      "Refresh all materialized views (dashboard stats, person state, affiliations). Safe to run anytime.",
    icon: <RefreshCw className="h-5 w-5 text-muted-foreground" />,
    action: refreshViewsAction,
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
