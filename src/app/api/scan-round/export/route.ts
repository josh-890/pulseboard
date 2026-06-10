import JSZip from "jszip";
import { NextResponse } from "next/server";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { buildScanFiles } from "@/lib/services/scan-service";

/**
 * POST /api/scan-round/export
 * Body: { identityIds: string[] }
 * Returns: a .zip of per-platform URL files (one .txt per scannable platform),
 * each line formatted per that source's lineFormat. 400 on empty body, 404 when
 * the selection yields no scannable URLs.
 */
export async function POST(request: Request) {
  return withTenantFromHeaders(async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const identityIds = (body as { identityIds?: unknown })?.identityIds;
    if (
      !Array.isArray(identityIds) ||
      !identityIds.every((x) => typeof x === "string") ||
      identityIds.length === 0
    ) {
      return NextResponse.json(
        { error: "identityIds must be a non-empty string[]" },
        { status: 400 },
      );
    }

    const files = await buildScanFiles(identityIds as string[]);
    if (files.length === 0) {
      return NextResponse.json(
        { error: "No scannable URLs in selection" },
        { status: 404 },
      );
    }

    const zip = new JSZip();
    for (const f of files) zip.file(f.fileName, f.content);
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="pulseboard-scan-${stamp}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
