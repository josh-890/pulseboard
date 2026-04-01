import { NextResponse } from "next/server";
import { getAllCollectionsSummary } from "@/lib/services/collection-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

export async function GET() {
  return withTenantFromHeaders(async () => {
    const collections = await getAllCollectionsSummary();
    return NextResponse.json(collections);
  });
}
