import { NextResponse } from "next/server";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { quickJump } from "@/lib/services/quick-jump-service";

/**
 * GET /api/quick-jump?q=<query>
 * Returns QuickJumpHit[] — up to 5 per kind (people, sets, sessions, channels,
 * labels, artists, projects, collections, contacts); empty under 2 characters.
 */
export async function GET(request: Request) {
  return withTenantFromHeaders(async () => {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return NextResponse.json(await quickJump(q));
  });
}
