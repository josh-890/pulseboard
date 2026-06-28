import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Suspense } from "react";
import { Users2 } from "lucide-react";
import {
  getPersonReferences,
  type ReferenceSort,
} from "@/lib/services/relationship-service";
import {
  BrowserToolbar,
  type BrowserToolbarConfig,
} from "@/components/shared/browser-toolbar";
import { ReferencesWorkspace } from "@/components/people/references-workspace";

export const dynamic = "force-dynamic";

const VALID_SORTS = new Set<string>(["count", "name"]);

type ReferencesPageProps = {
  searchParams: Promise<{ q?: string; sort?: string; ignored?: string }>;
};

export default async function ReferencesPage({ searchParams }: ReferencesPageProps) {
  return withTenantFromHeaders(async () => {
    const sp = await searchParams;
    const q = sp.q?.trim() || undefined;
    const includeIgnored = sp.ignored === "true";
    const sort = (sp.sort && VALID_SORTS.has(sp.sort) ? sp.sort : "count") as ReferenceSort;

    const rows = await getPersonReferences({ q, includeIgnored, sort });

    const toolbarConfig: BrowserToolbarConfig = {
      basePath: "/people/references",
      searchPlaceholder: "Search references…",
      sortOptions: [
        { value: "count", label: "Most referenced" },
        { value: "name", label: "Name A–Z" },
      ],
      defaultSort: "count",
      filterGroups: [{ type: "toggle", param: "ignored", label: "Show ignored" }],
      resultCount: rows.length,
      totalCount: rows.length,
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-entity-person/15">
            <Users2 size={20} className="text-entity-person" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">References</h1>
            <p className="text-sm text-muted-foreground">
              People referenced but not yet added — resolve them into Persons or link to existing ones
            </p>
          </div>
        </div>

        <Suspense>
          <BrowserToolbar config={toolbarConfig} />
        </Suspense>

        <ReferencesWorkspace rows={rows} />
      </div>
    );
  });
}
