import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withTenantFromHeaders } from "@/lib/tenant-context";

export async function GET() {
  return withTenantFromHeaders(async () => {
    const channels = await prisma.channel.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(channels);
  });
}
