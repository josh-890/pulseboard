import { NextResponse } from "next/server";
import { getSkillEventMediaAsGalleryItems } from "@/lib/services/skill-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const items = await getSkillEventMediaAsGalleryItems(id);
  return NextResponse.json({ items });
}
