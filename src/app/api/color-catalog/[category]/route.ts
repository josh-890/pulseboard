import { NextResponse } from "next/server";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { listColorCatalog } from "@/lib/services/color-catalog-service";
import type { ColorCategory } from "@/lib/constants/color-catalog";

const VALID: ReadonlySet<ColorCategory> = new Set(["hair", "eye", "skin"]);

function isValid(v: string): v is ColorCategory {
  return VALID.has(v as ColorCategory);
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ category: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { category } = await ctx.params;
    if (!isValid(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    const entries = await listColorCatalog(category);
    return NextResponse.json({
      entries: entries.map((e) => ({
        value: e.valueNorm,
        display: e.display,
        hue: e.hue,
        shade: e.shade,
        needsReview: e.needsReview,
      })),
    });
  });
}
