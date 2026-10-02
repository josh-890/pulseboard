import { NextResponse } from "next/server";
import { getSlotSets } from "@/lib/services/tag-slot-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

// Quick-tag slot sets with their tags; the active one is guaranteed to exist.
export async function GET() {
  return withTenantFromHeaders(async () => NextResponse.json(await getSlotSets()));
}
