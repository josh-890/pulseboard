import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// archive-upload.ps1 cannot run here (no PowerShell); these checks pin the parts
// that must agree with the app and the other agents.
const SCRIPT = readFileSync(path.join(process.cwd(), "scripts/archive-upload.ps1"), "utf8");
const COVER = readFileSync(path.join(process.cwd(), "scripts/archive-cover.ps1"), "utf8");
const code = SCRIPT.replace(/<#[\s\S]*?#>/g, "").replace(/^\s*#.*$/gm, "");

describe("archive-upload.ps1 — static checks", () => {
  it("uses the cover agent's designated-cover pattern verbatim", () => {
    const pattern = (s: string) => /\$COVER_PATTERN = '([^']+)'/.exec(s)?.[1];
    expect(pattern(SCRIPT)).toBeDefined();
    expect(pattern(SCRIPT)).toBe(pattern(COVER));
  });

  it("talks to the endpoints the app serves", () => {
    expect(code).toContain("/api/archive/upload-worklist");
    expect(code).toContain("/api/archive/set-upload/$TargetSetId");
    expect(code).toMatch(/\/api\/archive\/set-upload\/\$\(\$s\.setId\)\/complete/);
  });

  // Archive folder names may contain [ and ]: -Path and -InFile read them as wildcards
  it("never hands an archive path to a wildcard-reading parameter", () => {
    expect(code).not.toMatch(/-InFile/);
    expect(code).not.toMatch(/Get-ChildItem\s+-Path\b/);
    expect(code).not.toMatch(/Test-Path\s+-Path\b/);
  });

  it("only sends what the server accepts", () => {
    for (const ext of [".jpg", ".jpeg", ".png", ".webp", ".gif"]) expect(code).toContain(`"${ext}"`);
  });
});
