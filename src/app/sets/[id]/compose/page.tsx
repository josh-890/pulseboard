import { notFound } from "next/navigation";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { getComposerCatalog, getComposerWorkspace } from "@/lib/services/composer-service";
import { ComposerWorkbench } from "@/components/composer/composer-workbench";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The tag workbench for a set (ADR-0042)
export default async function SetComposePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const photo = typeof sp.photo === "string" ? sp.photo : null;
  return withTenantFromHeaders(async () => {
    const catalog = await getComposerCatalog();
    if (catalog.paths.length === 0) notFound();
    const ws = await getComposerWorkspace({ kind: "set", id }, catalog);
    if (!ws) notFound();
    return <ComposerWorkbench catalog={catalog} title={ws.title} backHref={ws.backHref} photos={ws.photos} initialPhotoId={photo} />;
  });
}
