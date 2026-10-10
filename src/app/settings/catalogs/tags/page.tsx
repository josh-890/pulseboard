export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowRight, Tag } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { TagCatalogManager } from "@/components/settings/tag-catalog-manager";
import { getAllTagGroups } from "@/lib/services/tag-service";

// Tag groups — the frame of the catalogue (2026-10-10). The tags themselves are
// managed in /tags: create, rename, move between groups, merge, delete, clean up.
export default async function TagGroupsPage() {
  return withTenantFromHeaders(async () => {
    const tagGroups = await getAllTagGroups();

    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Tag groups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A group&apos;s domain decides where its tags may be applied (persons, content — sessions, sets, images and
            archive folders — or projects); inside content its typical level only ranks the picker. Exclusive groups
            allow one of their tags per item.
          </p>
        </div>
        <Link
          href="/tags"
          className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm transition-colors duration-150 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Tag size={16} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1">
            <span className="font-medium">Manage the tags themselves in /tags</span>
            <span className="block text-xs text-muted-foreground">
              Create, rename, move to another group, sub-tags, merge, delete — and find unused, ambiguous or near-duplicate tags.
            </span>
          </span>
          <ArrowRight size={14} className="text-primary" aria-hidden="true" />
        </Link>
        <TagCatalogManager groups={tagGroups} />
      </div>
    );
  });
}
