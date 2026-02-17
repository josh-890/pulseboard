import { searchPersonsPaginated } from "@/lib/services/person-service";
import { PersonBrowser } from "./person-browser";
import type { ProjectRole } from "@/lib/types";

type PersonResultsProps = {
  q: string;
  role: ProjectRole | "all";
  traitCategory?: string;
};

export async function PersonResults({ q, role, traitCategory }: PersonResultsProps) {
  const roleFilter = role !== "all" ? role : undefined;
  const { items, nextCursor } = await searchPersonsPaginated(
    q || undefined,
    roleFilter,
    traitCategory || undefined,
  );

  return (
    <PersonBrowser
      initialItems={items}
      initialCursor={nextCursor}
      query={q ?? ""}
      role={role ?? ""}
      traitCategory={traitCategory ?? ""}
    />
  );
}
