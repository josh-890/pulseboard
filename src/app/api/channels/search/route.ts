import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const channels = await prisma.channel.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(channels);
}
