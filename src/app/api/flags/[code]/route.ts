import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const FLAGS_DIR = path.join(process.cwd(), "public", "flags");
const CDN_BASE = "https://hatscripts.github.io/circle-flags/flags";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params;
  const code = rawCode.toLowerCase().replace(/[^a-z]/g, "");
  if (!code || code.length !== 2) {
    return NextResponse.json({ error: "Invalid country code" }, { status: 400 });
  }

  const localPath = path.join(FLAGS_DIR, `${code}.svg`);

  // Already cached — redirect to static file
  if (existsSync(localPath)) {
    return NextResponse.redirect(new URL(`/flags/${code}.svg`, _request.url));
  }

  // Download from CDN and cache locally
  try {
    const res = await fetch(`${CDN_BASE}/${code}.svg`);
    if (!res.ok) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    const svg = await res.arrayBuffer();
    await mkdir(FLAGS_DIR, { recursive: true });
    await writeFile(localPath, Buffer.from(svg));

    // Serve the SVG directly (next request will get the static file)
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch flag" }, { status: 502 });
  }
}
