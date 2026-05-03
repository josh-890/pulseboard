import { CatalogsSidebar } from "@/components/settings/catalogs-sidebar";

export default function CatalogsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full gap-8">
      <CatalogsSidebar />
      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}
