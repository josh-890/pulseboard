import Link from "next/link";
import { ListTodo, Settings2, Tag } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { countOpenTodos, getTagTree, getWorkflowTodo } from "@/lib/services/tag-browse-service";
import { getNearDuplicateTags } from "@/lib/services/tag-service";
import { TagCatalogTree, TodoInbox } from "@/components/tags";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type TagsPageProps = { searchParams: Promise<{ view?: string }> };

// The tag browser (ADR-0033, S7) and the place tags are managed (2026-10-10):
// the catalogue tree with its actions, and the workflow To-do inbox. Group
// configuration (domain, level, colours) stays in Settings.
export default async function TagsPage({ searchParams }: TagsPageProps) {
  return withTenantFromHeaders(async () => {
    const { view } = await searchParams;
    const todoView = view === "todo";
    const [groups, openTodos, todos, nearDuplicates] = await Promise.all([
      todoView ? Promise.resolve([]) : getTagTree(),
      countOpenTodos(),
      todoView ? getWorkflowTodo() : Promise.resolve([]),
      // Strict: kebab names of one family (nailpolish-red/-black) are close by design
      todoView ? Promise.resolve([]) : getNearDuplicateTags(0.7),
    ]);
    const tagCount = groups.reduce((n, g) => n + g.tags.length, 0);

    const tab = (active: boolean) =>
      cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
      );

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
              <Tag size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Tags</h1>
              <p className="text-sm text-muted-foreground">
                {todoView ? `${openTodos} open to-do${openTodos === 1 ? "" : "s"}` : `${tagCount} tags in ${groups.length} groups`}
              </p>
            </div>
          </div>
          <Link
            href="/settings/catalogs/tags"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings2 size={14} /> Groups &amp; settings
          </Link>
        </div>

        <nav className="flex gap-1" aria-label="Tags views">
          <Link href="/tags" className={tab(!todoView)} aria-current={!todoView ? "page" : undefined}>
            <Tag size={14} /> Catalogue
          </Link>
          <Link href="/tags?view=todo" className={tab(todoView)} aria-current={todoView ? "page" : undefined}>
            <ListTodo size={14} /> To-do
            {openTodos > 0 && <span className="rounded-full bg-amber-500/20 px-1.5 text-[11px] tabular-nums text-amber-400">{openTodos}</span>}
          </Link>
        </nav>

        {todoView ? <TodoInbox todos={todos} /> : <TagCatalogTree groups={groups} nearDuplicates={nearDuplicates} />}
      </div>
    );
  });
}
