import { NextResponse } from "next/server";
import { getSkillEventMediaAsGalleryItems } from "@/lib/services/skill-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { id } = await params;
    const items = await getSkillEventMediaAsGalleryItems(id);
    return NextResponse.json({ items });
  });
}
