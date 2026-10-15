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

  // One run at a time per tenant (2026-10-13): the hourly scheduled task and a
  // run by hand must not upload side by side
  it("takes a per-tenant lock before the worklist and always releases it", () => {
    const take = code.indexOf("[System.Threading.Mutex]::new(");
    const worklist = code.indexOf("/api/archive/upload-worklist");
    expect(take).toBeGreaterThan(-1);
    expect(take).toBeLessThan(worklist);
    expect(code).toMatch(/\$lockName = "Global\\Pulseboard-archive-upload-/);
    expect(code).toContain("WaitOne(0)");
    expect(code).toContain("AbandonedMutexException");
    // The whole run sits in try { … } finally { ReleaseMutex }
    const tryAt = code.indexOf("\ntry {", take);
    const finallyAt = code.lastIndexOf("} finally {");
    expect(tryAt).toBeGreaterThan(take);
    expect(tryAt).toBeLessThan(worklist);
    expect(finallyAt).toBeGreaterThan(worklist);
    expect(code.slice(finallyAt)).toContain("$lock.ReleaseMutex()");
  });

  it("lets a dry run go without the lock", () => {
    expect(code).toMatch(/if \(-not \$DryRun\) \{\s*\$lock = \[System\.Threading\.Mutex\]/);
  });

  it("keeps its braces balanced", () => {
    const strip = code.replace(/"(?:[^"`]|`.)*"|'[^']*'/g, '""');
    const open = (strip.match(/\{/g) ?? []).length;
    const close = (strip.match(/\}/g) ?? []).length;
    expect(open).toBe(close);
  });

  // 2026-10-15: a finished set back for incomplete copies sends just those and
  // does not report the set done again (that would overwrite its failed list)
  it("sends only the retry files of a finished set and skips the done report", () => {
    expect(code).toMatch(/\$sendList = @\(\$sendList \| Where-Object \{ \$retry -contains \$_\.Name \}\)/);
    const skip = code.indexOf("if ($retry) { Write-Host \"  Re-fetch done\"; continue }");
    const complete = code.indexOf("/complete");
    expect(skip).toBeGreaterThan(-1);
    expect(skip).toBeLessThan(complete);
  });
});

