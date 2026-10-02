"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TagFacetGroup } from "@/lib/services/tag-filter-service";
import { parseTagQuery, serializeTagQuery, type TagQuery } from "@/lib/tag-query";
import { TagFilterButton } from "./tag-filter-button";
import { TagFilterChips } from "./tag-filter-chips";
import { TagQueryBox } from "./tag-query-box";

export type GalleryTagFilterProps = {
  facets: TagFacetGroup[];
  problems?: string[];
  /** Images shown / in the gallery, for the summary */
  shown: number;
  total: number;
};

// Tag filter for an image gallery page (ADR-0033, S4). Lives in the URL as
// `tags=…` like the browsers; the page resolves it on the server and hands the
// gallery the matching image ids.
export function GalleryTagFilter({ facets, problems, shown, total }: GalleryTagFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const text = searchParams.get("tags") ?? "";
  const query = parseTagQuery(text).query;

  const setText = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("tags", next);
      else params.delete("tags");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  const onChange = useCallback((q: TagQuery) => setText(serializeTagQuery(q)), [setText]);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <TagFilterButton facets={facets} query={query} onChange={onChange} countNoun="images" />
      <TagQueryBox value={text} onSubmit={setText} facets={facets} entityType="MEDIA_ITEM" />
      {text && (
        <>
          <TagFilterChips entityType="MEDIA_ITEM" facets={facets} query={query} onChange={onChange} problems={problems} />
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {shown === 0 ? "No image matches these tags" : `${shown} of ${total} images`}
          </span>
        </>
      )}
    </div>
  );
}
