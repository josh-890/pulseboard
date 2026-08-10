import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A parser check for the one program in this repo that no test can run.
//
// `archive-scan.ps1` executes on the Windows box; there is no `pwsh` on the machine
// this repo is developed on, so a syntax error only surfaces in front of the
// operator, mid-run, against the live archive. Two shipped in one day: a call to a
// function an edit had deleted, and `New-Item -LiteralPath`, a parameter that
// does not exist. Both are cheap to catch by reading the text.
//
// This is deliberately narrow. It is not a PowerShell parser and does not pretend to
// be one — it encodes the two mistakes that actually happened.

const SCRIPT = readFileSync(
  path.resolve(__dirname, "../../../scripts/archive-scan.ps1"),
  "utf8",
);

/**
 * Strip only the comment-based help block and whole-line comments.
 *
 * Deliberately NOT strings: a regex that tries to pair quotes across a 1,600-line
 * PowerShell script swallows whole regions on the first unbalanced apostrophe, and
 * then reports functions that plainly exist as undefined. Leaving strings in risks
 * a false positive only if a message begins with a Verb-Noun at a statement
 * boundary — cheap to notice, unlike a check that lies.
 */
function codeOnly(text: string): string {
  return text.replace(/<#[\s\S]*?#>/g, "").replace(/^\s*#.*$/gm, "");
}

/** Cmdlets the script legitimately calls. Anything else Verb-Noun must be its own. */
const KNOWN_CMDLETS = new Set([
  "Write-Host", "Write-Warning", "Write-Error", "Write-Verbose", "Write-Output",
  "Get-Content", "Set-Content", "Get-ChildItem", "Get-Item", "Get-Date", "Get-Member",
  "Test-Path", "Join-Path", "Split-Path", "Resolve-Path", "Convert-Path",
  "New-Item", "New-Object", "Remove-Item", "Move-Item", "Copy-Item", "Rename-Item",
  "ConvertTo-Json", "ConvertFrom-Json", "Invoke-RestMethod", "Invoke-WebRequest",
  "Select-Object", "Sort-Object", "Where-Object", "ForEach-Object", "Measure-Object",
  "Group-Object", "Read-Host", "Start-Sleep", "Out-Null", "Out-File", "Add-Member",
  "Select-String", "Get-Command", "Import-Module", "Set-StrictMode",
]);

describe("archive-scan.ps1 — static checks", () => {
  const code = codeOnly(SCRIPT);
  const defined = new Set(
    [...code.matchAll(/^\s*function\s+([A-Za-z]+-[A-Za-z]+)\s*\{/gm)].map((m) => m[1]),
  );

  it("defines every custom function it calls", () => {
    // A Verb-Noun at the start of a statement, or right after a pipe or `(`.
    const called = new Set(
      [...code.matchAll(/(?:^|\||\(|\{|;)\s*([A-Z][a-zA-Z]*-[A-Z][a-zA-Z]*)\b/gm)].map((m) => m[1]),
    );
    const missing = [...called].filter((name) => !KNOWN_CMDLETS.has(name) && !defined.has(name));
    expect(missing).toEqual([]);
  });

  // A function must exist before the line that calls it runs. An edit that moves or
  // deletes a definition is exactly how Write-WritePhases went missing.
  it("defines each function before it is called", () => {
    const lines = code.split("\n");
    const definedAt = new Map<string, number>();
    lines.forEach((line, i) => {
      const m = /^\s*function\s+([A-Za-z]+-[A-Za-z]+)\s*\{/.exec(line);
      if (m && !definedAt.has(m[1])) definedAt.set(m[1], i);
    });

    const tooEarly: string[] = [];
    lines.forEach((line, i) => {
      for (const [name, at] of definedAt) {
        // The call sites that matter are the ones outside any function body, but a
        // definition after ANY call is worth flagging: it reads as an accident.
        if (i < at && new RegExp(`(?:^|\\||\\(|;)\\s*${name}\\b`).test(line)) {
          tooEarly.push(`${name} called on line ${i + 1}, defined on line ${at + 1}`);
        }
      }
    });
    expect(tooEarly).toEqual([]);
  });

  // New-Item takes -Path, never -LiteralPath. The distinction matters here because
  // archive folder names may contain [ or ], which -Path reads as a wildcard — so
  // the fix is a .NET call, not a swap to -Path.
  it("never passes -LiteralPath to a cmdlet that has no such parameter", () => {
    const offenders = [...code.matchAll(/\b(New-Item|New-Object)\b[^\n|]*-LiteralPath/g)].map(
      (m) => m[0].trim(),
    );
    expect(offenders).toEqual([]);
  });

  // The agent and the app must agree on where things live; a drift here is silent
  // until an operator finds an empty folder.
  it("agrees with the app about the metadata layout", () => {
    expect(SCRIPT).toContain('$META_DIR = ".pulseboard"');
    expect(SCRIPT).toContain('"pulseboard.json"');
    expect(SCRIPT).toContain('"cast.json"');
  });
});
