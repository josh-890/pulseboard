import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Suspense } from "react";
import { BookUser } from "lucide-react";
import {
  getContacts,
  type ContactSort,
} from "@/lib/services/relationship-service";
import {
  BrowserToolbar,
  type BrowserToolbarConfig,
} from "@/components/shared/browser-toolbar";
import { ContactsWorkspace } from "@/components/people/contacts-workspace";

export const dynamic = "force-dynamic";

const VALID_SORTS = new Set<string>(["count", "name"]);

type ContactsPageProps = {
  searchParams: Promise<{ q?: string; sort?: string; ignored?: string }>;
};

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  return withTenantFromHeaders(async () => {
    const sp = await searchParams;
    const q = sp.q?.trim() || undefined;
    const includeIgnored = sp.ignored === "true";
    const sort = (sp.sort && VALID_SORTS.has(sp.sort) ? sp.sort : "count") as ContactSort;

    const rows = await getContacts({ q, includeIgnored, sort });

    const toolbarConfig: BrowserToolbarConfig = {
      basePath: "/people/contacts",
      searchPlaceholder: "Search contacts…",
      sortOptions: [
        { value: "count", label: "Most mentioned" },
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
            <BookUser size={20} className="text-entity-person" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Contacts</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{rows.length}</span>{" "}
              {rows.length === 1 ? "contact" : "contacts"} — mentioned on imports or sets but not yet added; resolve into Persons or link to existing ones
            </p>
          </div>
        </div>

        <Suspense>
          <BrowserToolbar config={toolbarConfig} />
        </Suspense>

        <ContactsWorkspace rows={rows} />
      </div>
    );
  });
}
