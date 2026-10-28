import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Suspense } from "react";
import Link from "next/link";
import { BookUser, History } from "lucide-react";
import {
  getUnlockingContacts,
  getContactsPage,
  CONTACTS_PAGE_SIZE,
} from "@/lib/services/relationship-service";
import {
  BrowserToolbar,
  type BrowserToolbarConfig,
} from "@/components/shared/browser-toolbar";
import { ContactsWorkspace } from "@/components/people/contacts-workspace";

export const dynamic = "force-dynamic";

type ContactsPageProps = {
  searchParams: Promise<{ q?: string; ignored?: string }>;
};

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  return withTenantFromHeaders(async () => {
    const sp = await searchParams;
    const q = sp.q?.trim() || undefined;
    const includeIgnored = sp.ignored === "true";

    // Priority head (small, ranked by sets unlocked) + paginated name-sorted tail.
    const head = await getUnlockingContacts({ q, includeIgnored });
    const headIds = head.map((r) => r.id);
    const tail = await getContactsPage({ q, includeIgnored, offset: 0, limit: CONTACTS_PAGE_SIZE, excludeIds: headIds });
    const total = head.length + tail.total;

    const toolbarConfig: BrowserToolbarConfig = {
      basePath: "/people/contacts",
      searchPlaceholder: "Search contacts…",
      sortOptions: [{ value: "name", label: "Name A–Z" }],
      defaultSort: "name",
      filterGroups: [{ type: "toggle", param: "ignored", label: "Show ignored" }],
      resultCount: head.length + tail.rows.length,
      totalCount: total,
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-entity-person/15">
            <BookUser size={20} className="text-entity-person" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Contacts</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{total}</span>{" "}
              {total === 1 ? "contact" : "contacts"} — mentioned on imports or sets but not yet added; resolve into Persons or link to existing ones
            </p>
          </div>
        </div>
          <Link
            href="/people/contacts/runs"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/15 bg-card/40 px-3 text-sm font-medium transition-colors hover:border-white/30 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <History size={15} aria-hidden /> Catalogue runs
          </Link>
        </div>

        <Suspense>
          <BrowserToolbar config={toolbarConfig} />
        </Suspense>

        <ContactsWorkspace
          key={`${q ?? ""}|${includeIgnored}`}
          head={head}
          tail={tail.rows}
          tailNextOffset={tail.nextOffset}
          headIds={headIds}
          q={q}
          includeIgnored={includeIgnored}
        />
      </div>
    );
  });
}
