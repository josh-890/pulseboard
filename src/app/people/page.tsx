import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonSearch } from "@/components/people/person-search";
import { RoleFilter } from "@/components/people/role-filter";
import { TraitCategoryFilter } from "@/components/people/trait-category-filter";
import { ProfileImageSelector } from "@/components/people/profile-image-selector";
import { PersonResults } from "@/components/people/person-results";
import { PersonListSkeleton } from "@/components/people/person-list-skeleton";
import { getTraitCategories } from "@/lib/services/trait-category-service";
import { getProfileImageLabels } from "@/lib/services/setting-service";
import type { ProjectRole } from "@/lib/types";

type PeoplePageProps = {
  searchParams: Promise<{
    q?: string;
    role?: string;
    traitCategory?: string;
    pimg?: string;
  }>;
};

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const { q, role, traitCategory, pimg } = await searchParams;
  const query = q ?? "";
  const roleFilter = (role as ProjectRole | "all") ?? "all";
  const traitCategoryFilter = traitCategory ?? "";
  const photoTag = pimg ?? "p-img01";
  const [categories, labels] = await Promise.all([
    getTraitCategories(),
    getProfileImageLabels(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold">People</h1>
        <Button asChild>
          <Link href="/people/new">
            <Plus size={16} className="mr-1" />
            New Person
          </Link>
        </Button>
      </div>
      <Suspense fallback={null}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <PersonSearch />
          </div>
          <RoleFilter />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <ProfileImageSelector labels={labels} />
          <TraitCategoryFilter categories={categories} />
        </div>
      </Suspense>
      <Suspense
        key={query + roleFilter + traitCategoryFilter + photoTag}
        fallback={<PersonListSkeleton />}
      >
        <PersonResults
          q={query}
          role={roleFilter}
          traitCategory={traitCategoryFilter}
          photoTag={photoTag}
        />
      </Suspense>
    </div>
  );
}
