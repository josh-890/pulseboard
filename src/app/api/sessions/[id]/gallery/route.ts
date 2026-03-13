import { NextResponse } from "next/server";
import { getSessionMediaGallery } from "@/lib/services/media-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const items = await getSessionMediaGallery(id);
  return NextResponse.json(items);
}
