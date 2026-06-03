"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import {
  getPromotedHoverPreview,
  getStagedHoverPreview,
  type CareerHoverPreviewData,
} from "@/lib/services/career-service";

// Server actions for the Career tab. Currently exposes only the hover
// preview fetcher; the timeline + facet count queries are run server-side
// on the page itself.

export async function getCareerHoverPreviewAction(
  kind: "promoted" | "staged",
  id: string,
): Promise<CareerHoverPreviewData | null> {
  return withTenantFromHeaders(async () => {
    return kind === "promoted"
      ? getPromotedHoverPreview(id)
      : getStagedHoverPreview(id);
  });
}
