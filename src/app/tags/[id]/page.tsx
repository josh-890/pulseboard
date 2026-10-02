import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CornerDownRight, Filter, ListTodo, Lock } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { getTagCarriers, getTagDetail, getTagImages } from "@/lib/services/tag-browse-service";
import { FavoritesGallery } from "@/components/gallery/favorites-gallery";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type TagDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; own?: string }>;
};

const TABS = ["images", "sets", "sessions", "people"] as const;
type TabKey = (typeof TABS)[number];

// One tag (ADR-0033, S7): what it means (description, aliases, parent and
// sub-tags) and what carries it — the tag or one of its sub-tags, own or
// inherited down the content chain.
export default async function TagDetailPage({ params, searchParams }: TagDetailPageProps) {
  return withTenantFromHeaders(async () => {
    const [{ id }, sp] = await Promise.all([params, searchParams]);
    const tag = await getTagDetail(id);
    if (!tag) notFound();
    const tab: TabKey = TABS.find((t) => t === sp.tab) ?? "images";
    const ownOnly = sp.own === "1";
    const query = `${tag.group.slug}:${tag.slug}`;

    const [carriers, images] = await Promise.all([
      getTagCarriers(id),
      tab === "images" ? getTagImages(id, ownOnly) : Promise.resolve({ items: [], total: 0 }),
    ]);
    const counts: Record<TabKey, number> = {
      images: tab === "images" ? images.total : NaN,
      sets: carriers.totals.sets,
      sessions: carriers.totals.sessions,
      people: carriers.totals.people,
    };
    const filterHref: Record<TabKey, string> = {
      images: "/favorites",
      sets: `/sets?type=all&tags=${encodeURIComponent(query)}`,
      sessions: `/sessions?tags=${encodeURIComponent(query)}`,
      people: `/people?tags=${encodeURIComponent(query)}`,
    };
    const tabHref = (t: TabKey, own = ownOnly) => `/tags/${id}?tab=${t}${own ? "&own=1" : ""}`;
    const list = tab === "sets" ? carriers.sets : tab === "sessions" ? carriers.sessions : tab === "people" ? carriers.people : [];
    const shownList = ownOnly ? list.filter((r) => r.own) : list;

    return (
      <div className="space-y-6">
        <Link href="/tags" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft size={14} aria-hidden="true" /> Tags
        </Link>

        <div className="rounded-2xl border border-white/15 bg-card/60 p-5 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: tag.group.color }} aria-hidden="true" />
            {tag.group.name}
            {tag.group.isExclusive && <Lock size={10} aria-label="one per item" />}
            {tag.group.kind === "WORKFLOW" && <ListTodo size={11} className="text-amber-400" aria-label="workflow" />}
            {tag.parent && (
              <>
                <span aria-hidden="true">›</span>
                <Link href={`/tags/${tag.parent.id}`} className="hover:underline">
                  {tag.parent.name}
                </Link>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold leading-tight">{tag.name}</h1>
          {tag.description && <p className="mt-1 text-sm text-muted-foreground">{tag.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {tag.aliases.length > 0 && <span>Also: {tag.aliases.map((a) => a.name).join(", ")}</span>}
            {tag.children.length > 0 && (
              <span className="flex flex-wrap items-center gap-1">
                <CornerDownRight size={11} aria-hidden="true" /> Sub-tags:
                {tag.children.map((c) => (
                  <Link key={c.id} href={`/tags/${c.id}`} className="rounded bg-muted/50 px-1.5 py-0.5 hover:underline">
                    {c.name}
                  </Link>
                ))}
                <span className="text-muted-foreground/70">(counted here)</span>
              </span>
            )}
            <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono">{query}</code>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex flex-wrap gap-1" aria-label="What carries this tag">
            {TABS.map((t) => (
              <Link
                key={t}
                href={tabHref(t)}
                aria-current={t === tab ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  t === tab ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {t}
                {!Number.isNaN(counts[t]) && <span className="ml-1 tabular-nums opacity-70">{counts[t]}</span>}
              </Link>
            ))}
          </nav>
          {(tab === "images" || tab === "sets") && (
            <Link
              href={tabHref(tab, !ownOnly)}
              className="ml-auto rounded-lg border border-white/15 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              aria-pressed={ownOnly}
            >
              {ownOnly ? "Own only · show inherited too" : "Own + inherited · show own only"}
            </Link>
          )}
          {tab !== "images" && (
            <Link
              href={filterHref[tab]}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Filter size={11} /> Open as filter
            </Link>
          )}
        </div>

        {tab === "images" ? (
          images.items.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-card/40 p-10 text-center text-sm text-muted-foreground">No image carries this tag{ownOnly ? " itself" : ""}.</p>
          ) : (
            <>
              {images.total > images.items.length && (
                <p className="text-xs text-muted-foreground">Showing the newest {images.items.length} of {images.total}.</p>
              )}
              <FavoritesGallery items={images.items} />
            </>
          )
        ) : shownList.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-card/40 p-10 text-center text-sm text-muted-foreground">Nothing here carries this tag.</p>
        ) : (
          <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-card/40">
            {shownList.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <Link href={r.href} className="min-w-0 flex-1 truncate hover:underline">
                  {r.label}
                </Link>
                {r.sublabel && <span className="hidden text-xs text-muted-foreground sm:inline">{r.sublabel}</span>}
                {!r.own && (
                  <span className="rounded border border-dashed border-white/20 px-1.5 text-[10px] text-muted-foreground" title="Inherited from its session">
                    from session
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  });
}
