"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { leadSection } from "@/lib/composer";
import { reorderComposerAction } from "@/lib/actions/composer-manage-actions";
import type { ComposerManageData } from "@/lib/services/composer-manage-service";
import { useCatalogCall } from "@/components/settings/intensity/use-catalog-call";
import { nodeKey, pathOfNode, type ManageNode } from "./composer-manage-node";
import { ComposerTree } from "./composer-tree";
import { ComposerPathPanel } from "./composer-path-panel";
import { ComposerSectionPanel } from "./composer-section-panel";
import { ComposerFacetPanel } from "./composer-facet-panel";
import { ComposerValuePanel } from "./composer-value-panel";
import { ComposerRelevanceMatrix } from "./composer-relevance-matrix";

export type ComposerManagerProps = {
  data: ComposerManageData;
};

type View = "tree" | "relevance";

/**
 * Settings → Composer (ADR-0043, R4): the tree with a panel for what is
 * selected, and the relevance matrix. Everything the seeds started is kept here.
 */
export function ComposerManager({ data }: ComposerManagerProps) {
  const { catalog, usage, regionCatalogIds, confusables } = data;
  const router = useRouter();
  const { call, pending } = useCatalogCall();
  const [view, setView] = useState<View>("tree");
  const [selected, setSelected] = useState<ManageNode | null>(() => (catalog.paths[0] ? { kind: "path", id: catalog.paths[0].id } : null));
  const [matrixPath, setMatrixPath] = useState(catalog.paths[0]?.id ?? "");
  const [matrixFocus, setMatrixFocus] = useState<string | null>(null);
  const lead = useMemo(() => leadSection(catalog), [catalog]);

  // A value added or a form created: select it once the refreshed tree holds it
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);
  if (pendingSelect && catalog.tags[pendingSelect]) {
    const tag = catalog.tags[pendingSelect];
    setSelected({ kind: "value", id: tag.id, groupId: tag.groupId });
    setPendingSelect(null);
  }
  // A section or facet added: selected once the refreshed tree holds it
  const [pendingNode, setPendingNode] = useState<ManageNode | null>(null);
  if (pendingNode && pathOfNode(catalog, pendingNode) && (pendingNode.kind !== "facet" || catalog.groups[pendingNode.id])) {
    setSelected(pendingNode);
    setPendingNode(null);
  }
  const selectSoon = (node: ManageNode) => {
    setPendingNode(node);
    router.refresh();
  };

  const openValue = (tagId: string) => {
    const tag = catalog.tags[tagId];
    if (tag) setSelected({ kind: "value", id: tagId, groupId: tag.groupId });
    else {
      setPendingSelect(tagId);
      router.refresh();
    }
  };

  const reorder = (kind: ManageNode["kind"], parentId: string | null, ids: string[]) =>
    void call(() => reorderComposerAction(kind, parentId, ids)).catch(() => {});

  const path = selected ? pathOfNode(catalog, selected) : undefined;
  const panelTitle = (() => {
    if (!selected) return null;
    switch (selected.kind) {
      case "path":
        return { kind: "Path", name: path?.name };
      case "section":
        return { kind: "Section", name: path?.sections.find((s) => s.id === selected.id)?.name };
      case "facet":
        return { kind: "Facet", name: catalog.groups[selected.id]?.name };
      case "value":
        return { kind: "Value", name: catalog.tags[selected.id]?.name };
    }
  })();

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Composer settings" className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
        {(
          [
            ["tree", "Tree"],
            ["relevance", "Relevance"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            data-testid={`composer-view-${v}`}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              view === v ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "relevance" ? (
        <ComposerRelevanceMatrix
          key={matrixFocus ?? "matrix"}
          catalog={catalog}
          pathId={matrixPath}
          onPath={setMatrixPath}
          focusGroupId={matrixFocus}
          call={call}
          pending={pending}
        />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="glass rounded-2xl border border-white/20 p-2 lg:sticky lg:top-4 lg:max-h-[80vh] lg:w-80 lg:shrink-0 lg:overflow-y-auto dark:border-white/10">
            <ComposerTree catalog={catalog} usage={usage} selected={selected} onSelect={setSelected} onReorder={reorder} busy={pending} />
          </div>
          <section
            aria-label={panelTitle ? `${panelTitle.kind} ${panelTitle.name}` : "Nothing selected"}
            className="glass min-w-0 flex-1 rounded-2xl border border-white/20 p-4 dark:border-white/10"
            key={selected ? nodeKey(selected) : "none"}
          >
            {panelTitle && (
              <h2 className="mb-4 text-lg font-semibold">
                <span className="mr-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{panelTitle.kind}</span>
                {panelTitle.name}
              </h2>
            )}
            {!selected && <p className="text-sm text-muted-foreground">Select a path, section, facet or value in the tree.</p>}
            {selected?.kind === "path" && path && (
              <ComposerPathPanel path={path} call={call} pending={pending} onSectionAdded={(id) => selectSoon({ kind: "section", id, pathId: path.id })} />
            )}
            {selected?.kind === "section" &&
              (() => {
                const section = path?.sections.find((s) => s.id === selected.id);
                return section && path ? (
                  <ComposerSectionPanel
                    section={section}
                    pathId={path.id}
                    isLead={lead?.section.id === section.id}
                    call={call}
                    pending={pending}
                    onFacetAdded={(id, sectionId) => selectSoon({ kind: "facet", id, sectionId })}
                    onDeleted={(pathId) => setSelected({ kind: "path", id: pathId })}
                  />
                ) : null;
              })()}
            {selected?.kind === "facet" && (
              <ComposerFacetPanel
                catalog={catalog}
                groupId={selected.id}
                sectionId={selected.sectionId}
                path={path}
                call={call}
                pending={pending}
                onRelevance={() => {
                  setMatrixPath(path?.id ?? matrixPath);
                  setMatrixFocus(selected.id);
                  setView("relevance");
                }}
                onAdded={openValue}
                onDetached={() => path && setSelected({ kind: "section", id: selected.sectionId, pathId: path.id })}
              />
            )}
            {selected?.kind === "value" && (
              <ComposerValuePanel
                catalog={catalog}
                tagId={selected.id}
                usage={usage[selected.id] ?? 0}
                regionCatalogId={regionCatalogIds[selected.id] ?? null}
                confusables={confusables[selected.id] ?? []}
                call={call}
                pending={pending}
                onOpen={openValue}
                onRefresh={() => router.refresh()}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
