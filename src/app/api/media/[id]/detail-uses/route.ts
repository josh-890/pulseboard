import { NextResponse } from "next/server";
import { getDetailUsesAcrossPeople, getDetailUsesOfImage } from "@/lib/services/detail-use-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

// Where this image is already used in a person's detail categories — a copy in
// the reference session, or an Aligned image baked from it. Feeds the "already
// here" hints of the assign sheet, the aligner and the lightbox info panel.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { id } = await params;
    const personId = new URL(request.url).searchParams.get("personId");
    try {
      // Without a person: every person whose details hold it (lightbox info panel).
      if (!personId) return NextResponse.json(await getDetailUsesAcrossPeople(id));
      return NextResponse.json(await getDetailUsesOfImage(personId, id));
    } catch (err) {
      console.error("[detail uses]", err);
      return NextResponse.json({ error: "Could not check where this photo is used" }, { status: 500 });
    }
  });
}
