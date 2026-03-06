import { NextResponse } from "next/server";
import { getAllCollectionsSummary } from "@/lib/services/collection-service";

export async function GET() {
  const collections = await getAllCollectionsSummary();
  return NextResponse.json(collections);
}
