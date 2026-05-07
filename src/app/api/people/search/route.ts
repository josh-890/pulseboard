import { NextResponse } from "next/server";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { prisma } from "@/lib/db";

/**
 * GET /api/people/search?q=<query>
 * Returns: { id, displayName, icgId }[]  (max 20)
 */
export async function GET(request: Request) {
  return withTenantFromHeaders(async () => {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";

    if (!q) {
      return NextResponse.json([]);
    }

    const aliases = await prisma.personAlias.findMany({
      where: {
        isCommon: true,
        name: { contains: q, mode: "insensitive" },
      },
      select: {
        name: true,
        person: { select: { id: true, icgId: true } },
      },
      take: 20,
      orderBy: { name: "asc" },
    });

    const results = aliases.map((a) => ({
      id: a.person.id,
      displayName: a.name,
      icgId: a.person.icgId,
    }));

    return NextResponse.json(results);
  });
}
