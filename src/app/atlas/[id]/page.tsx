import { withTenantFromHeaders } from "@/lib/tenant-context";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutGrid, ChevronLeft } from "lucide-react";
import { getAtlasGridForCategory } from "@/lib/services/atlas-service";
import { AtlasGrid } from "@/components/atlas/atlas-grid";

export const dynamic = "force-dynamic";

export default async function AtlasCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  return withTenantFromHeaders(async () => {
    const { id } = await params;
    const { category, tiles } = await getAtlasGridForCategory(id);
    if (!category) notFound();

    return (
      <div className="space-y-6">
        <div>
          <Link
            href="/atlas"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft size={15} /> Atlas
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
              <LayoutGrid size={20} className="text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">{category.name}</h1>
              <p className="text-sm text-muted-foreground">
                {category.groupName} · {tiles.length} aligned image{tiles.length !== 1 ? "s" : ""} across people
              </p>
            </div>
          </div>
        </div>

        <AtlasGrid tiles={tiles} aspectW={category.aspectW} aspectH={category.aspectH} />
      </div>
    );
  });
}
