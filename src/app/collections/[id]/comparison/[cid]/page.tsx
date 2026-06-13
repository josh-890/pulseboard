import { withTenantFromHeaders } from "@/lib/tenant-context";
import { notFound } from "next/navigation";
import { getComparisonDetail } from "@/lib/services/comparison-service";
import { getCollectionWithItems } from "@/lib/services/collection-service";
import { ComparisonViewer } from "@/components/collections/comparison-viewer";

export const dynamic = "force-dynamic";

export default async function ComparisonPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  return withTenantFromHeaders(async () => {
    const { id, cid } = await params;
    const comparison = await getComparisonDetail(cid);
    if (!comparison || comparison.collectionId !== id) notFound();
    const collection = await getCollectionWithItems(id);

    return (
      <ComparisonViewer
        comparison={comparison}
        collectionId={id}
        collectionName={collection?.name ?? "Collection"}
      />
    );
  });
}
