"use client";

import { useState, useTransition } from "react";
import { Trash2, Merge, ChevronDown, ChevronRight, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteTagDefinitionAction } from "@/lib/actions/tag-actions";
import { useRouter } from "next/navigation";
import type { TagUsageBreakdown, NearDuplicatePair, TagDefinitionWithGroup } from "@/lib/services/tag-service";

type SortKey = "name" | "groupName" | "person" | "session" | "media" | "set" | "project" | "total";

type TagAnalyticsProps = {
  orphanedTags: TagDefinitionWithGroup[];
  nearDuplicates: NearDuplicatePair[];
  usageBreakdown: TagUsageBreakdown[];
  onMerge?: (tagA: { id: string; name: string }, tagB: { id: string; name: string }) => void;
};

export function TagAnalytics({ orphanedTags, nearDuplicates, usageBreakdown, onMerge }: TagAnalyticsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [orphansExpanded, setOrphansExpanded] = useState(false);
  const [dupesExpanded, setDupesExpanded] = useState(false);
  const [usageExpanded, setUsageExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortAsc, setSortAsc] = useState(false);

  function handleDeleteOrphan(id: string) {
    if (!confirm("Permanently delete this unused tag?")) return;
    setDeletingId(id);
    startTransition(async () => {
      const result = await deleteTagDefinitionAction(id);
      setDeletingId(null);
      if (result.success) router.refresh();
    });
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "name" || key === "groupName");
    }
  }

  const sortedUsage = [...usageBreakdown].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortAsc ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
  });

  return (
    <div className="space-y-3">
      {/* Orphaned Tags */}
      <div className="rounded-xl border border-border/50 bg-background/30 p-3">
        <button
          type="button"
          onClick={() => setOrphansExpanded(!orphansExpanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {orphansExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="text-sm font-medium">Orphaned Tags</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {orphanedTags.length}
          </span>
          <span className="text-[10px] text-muted-foreground">Tags with zero usage across all entities</span>
        </button>

        {orphansExpanded && orphanedTags.length > 0 && (
          <div className="mt-2 space-y-1">
            {orphanedTags.map((tag) => (
              <div
                key={tag.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5",
                  isPending && deletingId === tag.id && "opacity-50",
                )}
              >
                <span
                  className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    borderColor: tag.group.color + "40",
                    backgroundColor: tag.group.color + "15",
                    color: tag.group.color,
                  }}
                >
                  {tag.name}
                </span>
                <span className="text-[10px] text-muted-foreground">{tag.group.name}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteOrphan(tag.id)}
                  disabled={isPending && deletingId === tag.id}
                  className="ml-auto rounded p-1 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                  title="Delete unused tag"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {orphansExpanded && orphanedTags.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">No orphaned tags found.</p>
        )}
      </div>

      {/* Near Duplicates */}
      <div className="rounded-xl border border-border/50 bg-background/30 p-3">
        <button
          type="button"
          onClick={() => setDupesExpanded(!dupesExpanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {dupesExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="text-sm font-medium">Near Duplicates</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {nearDuplicates.length}
          </span>
          <span className="text-[10px] text-muted-foreground">Tag pairs with similar names</span>
        </button>

        {dupesExpanded && nearDuplicates.length > 0 && (
          <div className="mt-2 space-y-1">
            {nearDuplicates.map((pair, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-1.5">
                <span className="text-xs font-medium">{pair.tagA.name}</span>
                <span className="text-[10px] text-muted-foreground">({pair.tagA.groupName})</span>
                <span className="text-[10px] text-muted-foreground/50">&harr;</span>
                <span className="text-xs font-medium">{pair.tagB.name}</span>
                <span className="text-[10px] text-muted-foreground">({pair.tagB.groupName})</span>
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {Math.round(pair.similarity * 100)}%
                </span>
                {onMerge && (
                  <button
                    type="button"
                    onClick={() => onMerge(pair.tagA, pair.tagB)}
                    className="rounded p-1 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
                    title="Merge these tags"
                  >
                    <Merge className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {dupesExpanded && nearDuplicates.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">No near-duplicate tags found.</p>
        )}
      </div>

      {/* Usage Breakdown */}
      <div className="rounded-xl border border-border/50 bg-background/30 p-3">
        <button
          type="button"
          onClick={() => setUsageExpanded(!usageExpanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {usageExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="text-sm font-medium">Usage by Tag</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {usageBreakdown.length}
          </span>
        </button>

        {usageExpanded && usageBreakdown.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  {(
                    [
                      ["name", "Tag"],
                      ["groupName", "Group"],
                      ["person", "P"],
                      ["session", "S"],
                      ["media", "M"],
                      ["set", "Set"],
                      ["project", "Prj"],
                      ["total", "Total"],
                    ] as [SortKey, string][]
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className={cn(
                        "cursor-pointer whitespace-nowrap px-2 py-1.5 text-left font-medium text-muted-foreground hover:text-foreground",
                        key !== "name" && key !== "groupName" && "text-right",
                      )}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {label}
                        {sortKey === key && (
                          <ArrowUpDown className="h-2.5 w-2.5" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedUsage.map((row) => (
                  <tr key={row.id} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-2 py-1">
                      <span
                        className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          borderColor: row.groupColor + "40",
                          backgroundColor: row.groupColor + "15",
                          color: row.groupColor,
                        }}
                      >
                        {row.name}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">{row.groupName}</td>
                    <td className="px-2 py-1 text-right font-mono">{row.person || "—"}</td>
                    <td className="px-2 py-1 text-right font-mono">{row.session || "—"}</td>
                    <td className="px-2 py-1 text-right font-mono">{row.media || "—"}</td>
                    <td className="px-2 py-1 text-right font-mono">{row.set || "—"}</td>
                    <td className="px-2 py-1 text-right font-mono">{row.project || "—"}</td>
                    <td className="px-2 py-1 text-right font-bold font-mono">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {usageExpanded && usageBreakdown.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">No tag usage data available.</p>
        )}
      </div>
    </div>
  );
}
