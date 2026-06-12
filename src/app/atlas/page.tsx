import { withTenantFromHeaders } from "@/lib/tenant-context";
import Link from "next/link";
import Image from "next/image";
import { LayoutGrid, Frame, ChevronRight } from "lucide-react";
import { getAtlasLocusCategories } from "@/lib/services/atlas-service";

export const dynamic = "force-dynamic";

export default async function AtlasPage() {
  return withTenantFromHeaders(async () => {
    const categories = await getAtlasLocusCategories();
    const total = categories.reduce((n, c) => n + c.alignedCount, 0);

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
            <LayoutGrid size={20} className="text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Atlas</h1>
            <p className="text-sm text-muted-foreground">
              Cross-person comparison by locus — {categories.length} aligned categor
              {categories.length === 1 ? "y" : "ies"}
              {total > 0 && ` · ${total} aligned image${total !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {categories.length === 0 ? (
          <div className="rounded-2xl border border-white/20 bg-card/70 p-12 text-center shadow-md backdrop-blur-sm">
            <Frame size={32} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No alignable categories yet. Bind an Alignment Template to a locus category
              in <span className="font-medium">Settings → Motif Templates</span>, then align
              photos on a person&rsquo;s Details tab.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/atlas/${c.id}`}
                className="group rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm transition-colors hover:border-amber-500/40"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">{c.name}</h2>
                    <p className="text-[11px] text-muted-foreground">{c.groupName}</p>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    {c.alignedCount}
                    <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
                {c.sampleThumbs.length > 0 ? (
                  <div className="flex gap-1.5">
                    {c.sampleThumbs.map((url, i) => (
                      <div
                        key={i}
                        className="relative flex-1 overflow-hidden rounded-lg border border-white/10 bg-muted/30"
                        style={{ aspectRatio: `${c.aspectW} / ${c.aspectH}` }}
                      >
                        <Image src={url} alt="" fill unoptimized className="object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-center rounded-lg border border-dashed border-white/10 bg-muted/15 text-[11px] text-muted-foreground/60"
                    style={{ aspectRatio: `${c.aspectW * 3} / ${c.aspectH}` }}
                  >
                    no aligned images yet
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  });
}
