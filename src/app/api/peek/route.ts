import { NextResponse } from "next/server";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { getPersonPeek, getSetPeek } from "@/lib/services/peek-service";

/**
 * GET /api/peek?type=person|set&id=<id>
 * Returns the Peek card (PersonPeek | SetPeek); 404 when missing, 400 for another type.
 */
export async function GET(request: Request) {
  return withTenantFromHeaders(async () => {
    const sp = new URL(request.url).searchParams;
    const type = sp.get("type");
    const id = sp.get("id") ?? "";
    if (!id || (type !== "person" && type !== "set")) {
      return NextResponse.json({ error: "type must be person or set" }, { status: 400 });
    }
    const peek = type === "person" ? await getPersonPeek(id) : await getSetPeek(id);
    return peek ? NextResponse.json(peek) : NextResponse.json({ error: "not found" }, { status: 404 });
  });
}
