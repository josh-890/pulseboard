import { NextResponse } from "next/server";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { prisma } from "@/lib/db";

/**
 * GET /api/people/search?q=<query>
 * Returns: { id, displayName, icgId, matchedAlias }[]  (max 20)
 * Searches all aliases (not just common name) + icgId.
 * matchedAlias is set when the match came from a non-common alias.
 */
export async function GET(request: Request) {
  return withTenantFromHeaders(async () => {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";

    if (!q) {
      return NextResponse.json([]);
    }

    const qLower = q.toLowerCase();

    const persons = await prisma.person.findMany({
      where: {
        OR: [
          { icgId: { contains: q, mode: "insensitive" } },
          { aliases: { some: { name: { contains: q, mode: "insensitive" } } } },
        ],
      },
      select: {
        id: true,
        icgId: true,
        aliases: {
          where: {
            OR: [{ isCommon: true }, { name: { contains: q, mode: "insensitive" } }],
          },
          select: { name: true, isCommon: true },
        },
      },
      take: 20,
      orderBy: { createdAt: "asc" },
    });

    const results = persons.map((p) => {
      const commonAlias = p.aliases.find((a) => a.isCommon);
      const matchedNonCommon = p.aliases.find(
        (a) => !a.isCommon && a.name.toLowerCase().includes(qLower),
      );
      return {
        id: p.id,
        displayName: commonAlias?.name ?? p.icgId,
        icgId: p.icgId,
        matchedAlias: matchedNonCommon?.name ?? null,
      };
    });

    return NextResponse.json(results);
  });
}
