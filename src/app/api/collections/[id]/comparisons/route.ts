import { NextResponse } from "next/server";
import { getComparisonsForCollection } from "@/lib/services/comparison-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTenantFromHeaders(async () => {
    const { id } = await params;
    const comparisons = await getComparisonsForCollection(id);
    return NextResponse.json(comparisons);
  });
}
