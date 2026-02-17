"use server";

import { searchPersonsPaginated } from "@/lib/services/person-service";
import type { PersonSearchPage } from "@/lib/services/person-service";
import type { ProjectRole } from "@/lib/types";

export async function loadMorePersons(
  query?: string,
  role?: string,
  traitCategory?: string,
  cursor?: string,
): Promise<PersonSearchPage> {
  const roleFilter =
    role && role !== "all" ? (role as ProjectRole) : undefined;
  return searchPersonsPaginated(
    query || undefined,
    roleFilter,
    traitCategory || undefined,
    cursor,
  );
}
