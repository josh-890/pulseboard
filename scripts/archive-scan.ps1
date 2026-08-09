<#
.SYNOPSIS
    Scans local archive folders and reports their status back to Pulseboard.

.DESCRIPTION
    Two scan modes:

    Targeted (default):
        Fetches all recorded archive paths from the Pulseboard app, checks each
        folder on the local filesystem, and POSTs the results to the ingest API.
        The app updates each set's archive status (OK, MISSING, CHANGED, INCOMPLETE).

    Full:
        Smart bidirectional reconciliation. Before walking the filesystem the script
        downloads all known ArchiveFolder records from the app (preload). It then
        walks the archive root(s) and for each folder:

        - Computes a content signature (SHA256 of sorted filename:size pairs) that is
          stable across renames, moves, and copy+delete operations.
        - Compares the leaf folder's LastWriteTime against the stored value to decide
          whether to skip reading the directory contents.
        - Classifies each folder as: create (new), update (changed), rename (path
          changed but signature matches known folder), or unchanged (nothing changed).
        - Sends only the delta (changed/new/renamed folders) to the server in batches.
          Unchanged leaves are skipped without any network traffic.

        The server handles rename propagation: if a renamed folder was linked to a
        Set or StagingSet, the archivePath on that record is automatically updated.

        Note: channel-folder and year-dir level mtime caches have been removed because
        NTFS only propagates mtime changes to the DIRECT parent (one level up). Adding
        a new set to 2024\ does not update SiteA\ mtime; adding files to an existing
        leaf does not update 2024\ mtime. The leaf-level skip remains because a leaf's
        mtime IS reliably updated when its own contents change.

    In both modes the script never modifies files — it only reads the filesystem
    and sends data to the app API.

    Authentication uses a shared API key sent as the x-archive-key header.
    Set ARCHIVE_API_KEY in the app's .env and pass the same value here via -ApiKey
    or the ARCHIVE_API_KEY environment variable.

.PARAMETER BaseUrl
    Base URL of the Pulseboard app.
    Default: value of ARCHIVE_BASE_URL environment variable, or http://localhost:3000

.PARAMETER ApiKey
    API key for authenticating with the archive endpoints.
    Default: value of ARCHIVE_API_KEY environment variable.

.PARAMETER Tenant
    Tenant ID (e.g. "pulse" or "xpulse").
    Default: value of ARCHIVE_TENANT environment variable.

.PARAMETER Mode
    Scan mode: Targeted (default) or Full.

.PARAMETER PhotosetRoot
    Root folder for photosets in Full mode (e.g. "X:\Sites\").
    Default: value of ARCHIVE_PHOTOSET_ROOT environment variable.

.PARAMETER VideosetRoot
    Root folder for videosets in Full mode (e.g. "M:\VSites\").
    Default: value of ARCHIVE_VIDEOSET_ROOT environment variable.

.PARAMETER BatchSize
    Number of folders to send per POST in Full mode. Default: 200.

.PARAMETER Path
    Full mode only. Restrict the walk to this subtree — a channel folder, a year
    folder, or a single leaf. Everything outside is not listed at all, so a scan of
    one channel takes seconds instead of walking tens of thousands of folders.

    IMPORTANT: a scoped scan SKIPS ghost detection. mark-ghosts flags every folder
    it did not see as missing on disk, which for a scoped run would be the entire
    rest of the archive. Deletions are therefore only detected by an unrestricted
    Full scan.

.PARAMETER Force
    Full mode only. Re-read every leaf, ignoring the leaf-mtime skip. Needed because
    NTFS does not bump a directory's mtime when a file inside it is edited — only
    when an entry is added, removed or renamed. Editing a file in place is thus
    invisible to the skip, and -Force is the only way to pick it up.

.PARAMETER NoSidecarPrompt
    Skip the interactive prompt after a Full scan that asks whether to write missing
    sidecar files. Use this in automated/scheduled runs. When omitted the script
    prompts with a default of Yes.

    Note: sidecars are written to ALL archive folders (not only linked ones), because
    every ArchiveFolder now has a stable archiveKey from the moment it is first scanned.

.PARAMETER DryRun
    Print what would be sent without POSTing to the app. Filesystem is still read.

.PARAMETER Verbose
    Print per-folder status during the walk.

.EXAMPLE
    .\archive-scan.ps1 -BaseUrl http://10.66.20.65:3000 -ApiKey s3cr3t -Tenant pulse

    Targeted scan of the "pulse" tenant.

.EXAMPLE
    .\archive-scan.ps1 -BaseUrl http://10.66.20.65:3000 -ApiKey s3cr3t -Tenant xpulse `
        -Mode Full -PhotosetRoot "X:\Sites\" -VideosetRoot "M:\VSites\"

    Smart full scan with rename detection and skip logic.

.EXAMPLE
    .\archive-scan.ps1 -Mode Full -PhotosetRoot "X:\Sites\" -NoSidecarPrompt

    Full scan + write _pulseboard.json into all folders without a sidecar, without prompting.

.EXAMPLE
    .\archive-scan.ps1 -Mode Full -PhotosetRoot "X:\Sites\" -Path "X:\Sites\FTV-FTV" -Force

    Re-read one channel folder completely, ignoring mtime. Use after editing files
    inside existing folders. Ghost detection is skipped.

.EXAMPLE
    .\archive-scan.ps1 -Mode Full -PhotosetRoot "X:\Sites\" -DryRun

    Dry-run: walk filesystem, classify folders, print what would be sent.

.EXAMPLE
    $env:ARCHIVE_BASE_URL      = "http://10.66.20.65:3000"
    $env:ARCHIVE_API_KEY       = "s3cr3t"
    $env:ARCHIVE_TENANT        = "pulse"
    $env:ARCHIVE_PHOTOSET_ROOT = "X:\Sites\"
    $env:ARCHIVE_VIDEOSET_ROOT = "M:\VSites\"
    .\archive-scan.ps1 -Mode Full

.NOTES
    Requires PowerShell 7+ (the `??` operator below is 7-only; the 5.1 that ships
    with Windows cannot parse this file).
    No external dependencies.

    Targeted mode:
      Video extensions checked: .mp4, .wmv, .mkv, .avi, .mov
      Videosets: folder exists + frames\ count + {folderName}.{ext} present
      Photosets: folder exists + root file count

    Full mode — folder structure expected (3 levels deep):
      {root}\{channelFolder}\{year}\{folderName}\

    Sidecar files (_pulseboard.json):
      After each Full scan, the script prompts whether to write missing sidecars
      (default Yes; use -NoSidecarPrompt for automation).
      Read by this script on every visit to detect cross-drive folder moves.
      Format: { "archiveKey": "uuid", "folderName": ..., "setId": ..., "title": ..., ... }
      Every ArchiveFolder has a stable archiveKey from first scan (including unlinked).
      Sidecars are written to ALL on-disk folders — not only linked ones.
      Existing sidecars are never overwritten.

    Metadata folder (.pulseboard\ inside each set folder) — ADR-0030:
      Everything tool-written lives here, so the set folder holds only media and
      frames\. One exclude rule covers it in backup, dedup and verification runs:
        .pulseboard\pulseboard.json   identity anchor (archiveKey) — survives moves
        .pulseboard\cast.json         generated: who the app knows is in this set
        .pulseboard\Name (ICG-ID)     YOUR marker files, see below
      Per archive root: {root}\.pulseboard\index.tsv — derived from the cast files,
      safe to delete. Files from before the move are removed where found.

    Cast markers (your own claims) — ADR-0030:
      One empty file per person in .pulseboard\, named "Name (ICG-ID)". The name is
      the whole statement: content is never read, an extension makes no difference,
      and "Iveta_C_(IC-87VY)", "Iveta C (IC-87VY)" and "iveta c (ic-87vy)" are the
      same person — the ICG-ID identifies, the name is provenance. Knowing that one
      person is in twelve sets is then twelve pastes, and a second person in a set is
      simply a second file. Markers only ADD: deleting one takes nothing back.
      -MigrateCast converts an older _cast.txt / _people.txt into markers, once.

    After moving folders between roots:
      The targeted sub-phase checks the paths the app currently records, so it reports
      every moved folder as MISSING — correct about the old path, and corrected by the
      walk moments later. Use -SkipTargeted for that one run to avoid writing the
      transient verdict, then scan normally afterwards.

      NOTE: adding a marker to an existing .pulseboard\ does NOT bump the set
      folder's own mtime — NTFS only updates the direct parent. The scan therefore
      reports the LATER of the two timestamps, so a new marker is always seen.

    Content signature (rename fingerprint):
      SHA256(sorted "filename:filesize" strings, "|"-delimited), first 16 hex chars.
      Media files only — the fingerprint that recognises a moved folder must not
      depend on files we write into it.
      Photosets: files in leaf folder root.
      Videosets: files in frames\ subfolder.
      Stable across: rename, move, copy+delete (file names/sizes preserved).
      Changes when: files added/removed/renamed inside the folder.

    Skip logic (directory LastWriteTime comparison):
      leafDirModifiedAt unchanged → skip file listing (action = unchanged)

      Channel-folder and year-dir level caching have been removed: NTFS only
      propagates mtime one level up, making those caches unreliable for detecting
      new or changed leaves in deeper subtrees.
#>

[CmdletBinding()]
param(
    [string]$BaseUrl       = ($env:ARCHIVE_BASE_URL       ?? "http://localhost:3000"),
    [string]$ApiKey        = ($env:ARCHIVE_API_KEY        ?? ""),
    [string]$Tenant        = ($env:ARCHIVE_TENANT         ?? ""),
    [ValidateSet('Targeted','Full')]
    [string]$Mode          = 'Targeted',
    [string]$PhotosetRoot  = ($env:ARCHIVE_PHOTOSET_ROOT  ?? ""),
    [string]$VideosetRoot  = ($env:ARCHIVE_VIDEOSET_ROOT  ?? ""),
    [int]$BatchSize        = 200,
    [string]$Path          = "",  # Full mode: restrict the walk to this subtree (channel folder, year, or a single leaf)
    [switch]$Force,               # Full mode: re-read every leaf, ignoring the leaf-mtime skip
    [switch]$NoSidecarPrompt,  # skip interactive sidecar-write prompt after Full scan (for automation)
    [switch]$SkipPeople,       # Full mode: skip writing .pulseboard\cast.json and the per-root index
    [switch]$Baseline,         # accept the reported counts as the new normal — do NOT derive CHANGED from them
    [switch]$MigrateCast,      # one-off: convert _cast.txt / _people.txt into markers in .pulseboard\
    [switch]$SkipTargeted,     # Full mode: skip the targeted sub-phase (use right after moving folders)
    [switch]$DryRun,
    [switch]$SkipChanCache,  # retained for backward compatibility; no longer has any effect
    [switch]$Rebake,         # after the scan, run archive-rebake.ps1 (HD re-bake, ADR-0017) — paths are freshly verified
    [switch]$RebakeForce     # pass -Force to the re-bake pass (redo even when not higher-res)
)

$ErrorActionPreference = "Stop"

# ── .env file loader ──────────────────────────────────────────────────────────
# Looks for a .env file next to the script. Lines: KEY=VALUE (# comments ok).
# Only fills in params/env-vars that weren't already supplied on the command line.

$dotEnvPath = Join-Path $PSScriptRoot ".env"
if (Test-Path -LiteralPath $dotEnvPath -PathType Leaf) {
    $dotEnv = @{}
    Get-Content $dotEnvPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
            $dotEnv[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    if (-not $ApiKey       -and $dotEnv["ARCHIVE_API_KEY"])        { $ApiKey       = $dotEnv["ARCHIVE_API_KEY"] }
    if ($BaseUrl -eq "http://localhost:3000" -and $dotEnv["ARCHIVE_BASE_URL"]) { $BaseUrl = $dotEnv["ARCHIVE_BASE_URL"] }
    if (-not $Tenant       -and $dotEnv["ARCHIVE_TENANT"])         { $Tenant       = $dotEnv["ARCHIVE_TENANT"] }
    if (-not $PhotosetRoot -and $dotEnv["ARCHIVE_PHOTOSET_ROOT"])  { $PhotosetRoot = $dotEnv["ARCHIVE_PHOTOSET_ROOT"] }
    if (-not $VideosetRoot -and $dotEnv["ARCHIVE_VIDEOSET_ROOT"])  { $VideosetRoot = $dotEnv["ARCHIVE_VIDEOSET_ROOT"] }
}

# ── Validation ────────────────────────────────────────────────────────────────

if (-not $ApiKey) {
    Write-Error "API key is required. Pass -ApiKey, set ARCHIVE_API_KEY, or add it to a .env file next to the script."
    exit 1
}

if ($Mode -eq 'Full' -and -not $PhotosetRoot -and -not $VideosetRoot) {
    Write-Error "Full mode requires at least one of -PhotosetRoot or -VideosetRoot (param, env var, or .env file)."
    exit 1
}

# ── Multi-root parser ─────────────────────────────────────────────────────────
# Mirrors the TypeScript parseRoots() function in archive-service.ts.
# Accepts a plain string (single root) or JSON array (multiple roots).

function Parse-Roots {
    param([string]$val)
    if (-not $val) { return @() }
    $t = $val.Trim()
    if ($t.StartsWith('[')) {
        try {
            $arr = $t | ConvertFrom-Json
            return @($arr | Where-Object { $_ -ne $null -and $_ -ne '' })
        } catch {}
    }
    return @($t)
}

$BaseUrl = $BaseUrl.TrimEnd("/")

# ── Request headers ───────────────────────────────────────────────────────────

$headers = @{ "x-archive-key" = $ApiKey }
if ($Tenant) { $headers["x-tenant-id"] = $Tenant }

# ── Shared helpers ────────────────────────────────────────────────────────────

$VideoExtensions = @(".mp4", ".wmv", ".mkv", ".avi", ".mov", ".m4v", ".ts")
$ImageExtensions = @(".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff")

# What counts as "a file of this set": media, and nothing else.
#
# A set is its images and videos. Everything else in the folder belongs to some
# tool — our own .pulseboard\ folder, Thumbs.db, desktop.ini, a stray readme. Counting those made the file
# count wrong and, worse, made it MOVE: writing a people file added one, and the app
# concluded from the changed count that someone had touched the set (276 sets were
# marked CHANGED that way). The content signature had the same flaw — the fingerprint
# that recognises a moved folder must not depend on files we write into it.
$MediaExtensions = $ImageExtensions + $VideoExtensions

# Where everything tool-written lives, one per set folder (ADR-0030). Named for its
# owner: another tool's metadata is not ours to host.
$META_DIR = ".pulseboard"
# Our own files inside it. Anything else in there with an ICG-ID in its name is a
# cast marker written by hand.
$OWN_META_FILES = @("pulseboard.json", "cast.json", "index.tsv")
# Mirrors ICG_ID_RE in src/lib/icg-id.ts.
$ICG_ID_PATTERN = '^[A-Z]{2}-[0-9]{2}[A-Z0-9@][A-Z0-9]+$'
# Generated files from before the move into .pulseboard\. Removed wherever they are
# found, so no folder ever carries two answers to the same question. The old anchor
# (_pulseboard.json) is NOT in this list — it is moved, never deleted.
$LEGACY_CAST_FILES = @("_pulseboard_cast.txt", "_pulseboard_people.txt")
$LEGACY_HAND_FILES = @("_cast.txt", "_people.txt")
# Counted across the walk so -MigrateCast can report what it did.
$script:MigrateStats = @{ files = 0; markers = 0; bad = 0 }

function Test-MediaFile {
    param([System.IO.FileInfo]$File)
    return $MediaExtensions -contains $File.Extension.ToLower()
}

# Returns an array of video file basenames (with extension) found in the given folder.
function Get-VideoFiles {
    param([string]$FolderPath)
    return @(
        Get-ChildItem -LiteralPath $FolderPath -File -ErrorAction SilentlyContinue |
        Where-Object { $VideoExtensions -contains $_.Extension.ToLower() } |
        ForEach-Object { $_.Name }
    )
}

function Normalize-Path {
    param([string]$P)
    return $P.TrimEnd("/\").ToLower().Replace("/","\")
}

# Invoke-RestMethod in PS 5.1 may auto-convert ISO date strings to [DateTime] objects.
# This helper handles both cases and always returns a UTC DateTime.
function To-UtcDateTime {
    param($val)
    if ($null -eq $val) { return $null }
    if ($val -is [datetime]) { return $val.ToUniversalTime() }
    # String — parse with invariant culture, treat Z suffix as UTC
    return [datetime]::Parse(
        [string]$val,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Globalization.DateTimeStyles]::RoundtripKind
    ).ToUniversalTime()
}

# ── TARGETED MODE ─────────────────────────────────────────────────────────────

function Check-ArchivePath {
    param(
        [string]$ArchiveLinkId,
        [string]$ArchivePath,
        [bool]$IsVideo,
        [string]$FolderName,
        [string]$ConfirmedFilename = ""
    )

    $exists = $false; $fileCount = $null; $videoPresent = $null; $videoFiles = $null; $errorMsg = $null

    try {
        if (Test-Path -LiteralPath $ArchivePath -PathType Container) {
            $exists = $true
            if ($IsVideo) {
                $framesDir = Join-Path $ArchivePath "frames"
                $fileCount = if (Test-Path -LiteralPath $framesDir -PathType Container) {
                    @(Get-ChildItem -LiteralPath $framesDir -File -ErrorAction SilentlyContinue |
                      Where-Object { Test-MediaFile $_ }).Count
                } else { 0 }
                $foundFiles = Get-VideoFiles $ArchivePath
                $videoFiles = $foundFiles
                # Check confirmed filename first, then fall back to exact folder-name match
                if ($ConfirmedFilename -and ($foundFiles -contains $ConfirmedFilename)) {
                    $videoPresent = $true
                } else {
                    $videoPresent = ($foundFiles | Where-Object {
                        [IO.Path]::GetFileNameWithoutExtension($_) -eq $FolderName
                    }).Count -gt 0
                }
            } else {
                $fileCount = @(Get-ChildItem -LiteralPath $ArchivePath -File -ErrorAction SilentlyContinue |
                               Where-Object { Test-MediaFile $_ }).Count
            }
        }
    } catch {
        $exists = $false; $fileCount = $null; $errorMsg = $_.Exception.Message
    }

    return [PSCustomObject]@{
        archiveLinkId = $ArchiveLinkId; path = $ArchivePath
        exists = $exists; fileCount = $fileCount; videoPresent = $videoPresent
        videoFiles = $videoFiles; error = $errorMsg
    }
}

function Get-TargetedStatusLabel { param($R)
    if ($R.error) { return "ERROR" }
    if (-not $R.exists) { return "MISSING" }
    if ($R.videoPresent -eq $false) { return "INCOMPLETE" }
    return "OK"
}

function Run-TargetedScan {
    param([switch]$AsSubPhase)

    if (-not $AsSubPhase) {
        Write-Host "Mode: Targeted"
        Write-Host ""
    } else {
        Write-Host "── Targeted scan (updating confirmed links) ────────────────────────────────"
    }
    Write-Host "Fetching known archive paths..."
    try {
        $raw = Invoke-RestMethod -Uri "$BaseUrl/api/archive/paths" -Headers $headers -Method Get
        # Invoke-RestMethod may return a single Object[] when the API returns a JSON array;
        # unwrap one level so $entries is always a flat array of path objects.
        if ($raw -is [System.Object[]] -and $raw.Count -eq 1 -and $raw[0] -is [System.Object[]]) {
            $entries = @($raw[0])
        } else {
            $entries = @($raw)
        }
    } catch {
        Write-Error "Failed to fetch paths: $_"; exit 1
    }

    $total = $entries.Count
    Write-Host "  Found $total path(s) to check"
    if ($total -eq 0) { Write-Host "Nothing to scan."; if (-not $AsSubPhase) { exit 0 } else { return } }

    $entries = $entries | ForEach-Object {
        if ($_ -is [System.Collections.Hashtable]) { [PSCustomObject]$_ } else { $_ }
    }

    $results = [System.Collections.ArrayList]::new()
    $counts  = @{ ok = 0; incomplete = 0; missing = 0; error = 0 }

    foreach ($entry in $entries) {
        $confirmedFn = if ($entry.confirmedVideoFilename) { [string]$entry.confirmedVideoFilename } else { "" }
        $result = Check-ArchivePath `
            -ArchiveLinkId ([string]$entry.archiveLinkId) `
            -ArchivePath ([string]$entry.path) -IsVideo ([bool]$entry.isVideo) `
            -FolderName ([string]$entry.folderName) `
            -ConfirmedFilename $confirmedFn

        [void]$results.Add($result)
        $label = Get-TargetedStatusLabel $result

        if ($VerbosePreference -ne "SilentlyContinue") {
            Write-Host "  [$label] $($entry.path)"
            if ($entry.isVideo) {
                if ($confirmedFn) {
                    Write-Host "          confirmed video: $confirmedFn"
                } else {
                    Write-Host "          video file expected: $($entry.folderName).{ext}"
                }
                Write-Host "          video present: $($result.videoPresent) — frames: $($result.fileCount)"
                if ($result.videoFiles -and $result.videoFiles.Count -gt 0) {
                    Write-Host "          video files found: $($result.videoFiles -join ', ')"
                }
            } else {
                Write-Host "          files: $($result.fileCount)"
            }
        }

        switch ($label) {
            "OK"         { $counts.ok++ }
            "INCOMPLETE" { $counts.incomplete++ }
            "MISSING"    { $counts.missing++ }
            "ERROR"      { $counts.error++ }
        }
    }

    if ($DryRun) {
        # A preview, not a dump. This used to print every record — 2,871 JSON
        # objects for a full archive — which buries the one thing a dry run is for:
        # the summary and whatever the write phases would do. Same shape as the Full
        # mode preview, so both dry runs read alike.
        Write-Host ""; Write-Host "Dry-run: would send $($results.Count) result(s)"
        if (-not $AsSubPhase -and $results.Count -gt 0) {
            $shown = [Math]::Min(3, $results.Count)
            Write-Host "First items preview:"
            ConvertTo-Json -InputObject @($results[0..($shown - 1)]) -Depth 5 | Write-Host
            if ($results.Count -gt $shown) {
                Write-Host "  … and $($results.Count - $shown) more (run without -DryRun to send them)"
            }
        }
    } else {
        Write-Host ""; Write-Host "Sending scan results..."
        try {
            $body = ConvertTo-Json -InputObject @($results) -Depth 5
            # -Baseline: the counts changed because the RULE changed, not because
            # anyone touched a set. Without it a re-baseline marks every link CHANGED.
            $ingestUrl = "$BaseUrl/api/archive/ingest" + $(if ($Baseline) { "?baseline=1" } else { "" })
            $response = Invoke-RestMethod -Uri $ingestUrl -Headers $headers `
                -Method Post -Body $body -ContentType "application/json"
            Write-Host "  Ingested $($response.count) result(s)"
        } catch {
            Write-Error "Failed to ingest results: $_"; exit 1
        }
    }

    Write-Host ""
    Write-Host "── Summary ────────────────────────────────────"
    Write-Host ("  OK:         " + $counts.ok)
    if ($counts.incomplete -gt 0) { Write-Host ("  Incomplete: " + $counts.incomplete) }
    if ($counts.missing    -gt 0) { Write-Host ("  Missing:    " + $counts.missing)    }
    if ($counts.error      -gt 0) { Write-Host ("  Errors:     " + $counts.error)      }
    Write-Host "────────────────────────────────────────────────"
}

# ── FULL MODE — Helpers ───────────────────────────────────────────────────────

function Compute-FolderSignature {
    param([string]$FolderPath, [bool]$IsVideo)

    $searchPath = if ($IsVideo) { Join-Path $FolderPath "frames" } else { $FolderPath }

    if (-not (Test-Path -LiteralPath $searchPath -PathType Container)) {
        return "empty"
    }

    $parts = @(Get-ChildItem -LiteralPath $searchPath -File -ErrorAction SilentlyContinue |
        Where-Object { Test-MediaFile $_ } |
        Sort-Object Name |
        ForEach-Object { "$($_.Name):$($_.Length)" })

    if ($parts.Count -eq 0) { return "empty" }

    $combined = $parts -join "|"
    $sha    = [System.Security.Cryptography.SHA256]::Create()
    $bytes  = [System.Text.Encoding]::UTF8.GetBytes($combined)
    $hash   = $sha.ComputeHash($bytes)
    $sha.Dispose()
    return [BitConverter]::ToString($hash).Replace("-","").Substring(0,16).ToLower()
}

function Get-FileCount {
    param([string]$FolderPath, [bool]$IsVideo)
    if ($IsVideo) {
        $framesDir = Join-Path $FolderPath "frames"
        if (Test-Path -LiteralPath $framesDir -PathType Container) {
            return @(Get-ChildItem -LiteralPath $framesDir -File -ErrorAction SilentlyContinue |
                     Where-Object { Test-MediaFile $_ }).Count
        }
        return 0
    }
    return @(Get-ChildItem -LiteralPath $FolderPath -File -ErrorAction SilentlyContinue |
             Where-Object { Test-MediaFile $_ }).Count
}

function Get-VideoPresent {
    param([string]$FolderPath, [string]$FolderName, [string]$ConfirmedFilename = "")
    $files = Get-VideoFiles $FolderPath
    # If a confirmed filename is known, check whether that file is still on disk
    if ($ConfirmedFilename -and ($files -contains $ConfirmedFilename)) {
        return $true
    }
    # Fall back to exact folder-name match
    foreach ($f in $files) {
        if ([IO.Path]::GetFileNameWithoutExtension($f) -eq $FolderName) {
            return $true
        }
    }
    return $false
}

function Parse-FolderName {
    param([string]$Name)
    # Pattern 1 — canonical: "YYYY-MM-DD-CODE Name - Title" (hyphen or en/em-dash, space both sides)
    # nameFormatOk = true only for this pattern
    if ($Name -match '^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9]+)\s+(.+?)\s+[-–—]\s+(.+)$') {
        return [PSCustomObject]@{
            parsedDate      = $Matches[1]
            parsedShortName = $Matches[2]
            parsedTitle     = $Matches[4]
            nameFormatOk    = $true
        }
    }
    # Pattern 2 — "Name -Title" (space before separator, no space after)
    if ($Name -match '^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9]+)\s+(.+?)\s+[-–—](\S.*)$') {
        return [PSCustomObject]@{
            parsedDate      = $Matches[1]
            parsedShortName = $Matches[2]
            parsedTitle     = $Matches[4].TrimStart()
            nameFormatOk    = $false
        }
    }
    # Pattern 3 — "Name- Title" (no space before separator, space after)
    if ($Name -match '^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9]+)\s+(.+?)[-–—]\s+(.+)$') {
        return [PSCustomObject]@{
            parsedDate      = $Matches[1]
            parsedShortName = $Matches[2]
            parsedTitle     = $Matches[4]
            nameFormatOk    = $false
        }
    }
    # Pattern 4 — no separator at all: everything after the code is the title
    if ($Name -match '^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9]+)\s+(.+)$') {
        return [PSCustomObject]@{
            parsedDate      = $Matches[1]
            parsedShortName = $Matches[2]
            parsedTitle     = $Matches[3]
            nameFormatOk    = $false
        }
    }
    # No pattern matched — cannot extract date or short name
    return [PSCustomObject]@{
        parsedDate      = $null
        parsedShortName = $null
        parsedTitle     = $null
        nameFormatOk    = $false
    }
}

# ── FULL MODE — Preload ───────────────────────────────────────────────────────

function Load-KnownFolders {
    Write-Host "  Preloading known folders from server..."

    $byPath     = @{}    # normalised fullPath → record
    $bySig      = @{}    # contentSignature → record (for rename detection)
    $byArchKey  = @{}    # archiveKey → record (for sidecar write phase)
    $cursor     = $null
    $total      = 0

    do {
        $url = "$BaseUrl/api/archive/folders?pageSize=2000"
        if ($cursor) { $url += "&cursor=$cursor" }

        try {
            $page = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        } catch {
            Write-Error "Failed to preload known folders: $_"; exit 1
        }

        # PS 5.1: normalise Hashtable → PSCustomObject
        $records = @($page.records) | ForEach-Object {
            if ($_ -is [System.Collections.Hashtable]) { [PSCustomObject]$_ } else { $_ }
        }

        foreach ($rec in $records) {
            $normPath = Normalize-Path ([string]$rec.fullPath)
            $byPath[$normPath] = $rec
            $sig = [string]$rec.contentSignature
            if ($sig -and $sig -ne "" -and $sig -ne "empty") {
                # A signature might appear twice in edge cases; keep the first seen
                if (-not $bySig.ContainsKey($sig)) {
                    $bySig[$sig] = $rec
                }
            }
            # Index linked folders by archiveKey for sidecar write phase
            $ak = [string]$rec.archiveKey
            if ($ak -and $ak -ne "") {
                $byArchKey[$ak] = $rec
            }
        }

        $total  += $records.Count
        $cursor  = $page.nextCursor
        Write-Host "    Loaded $total record(s)..."

    } while ($cursor)

    Write-Host "  Preload complete: $total folder(s) known ($($byArchKey.Count) with archiveKey — all folders have one)"
    return $byPath, $bySig, $byArchKey
}

# ── FULL MODE — Walk ──────────────────────────────────────────────────────────

# -Path scoping. A directory is in scope when it is the scope itself, an ANCESTOR
# of it (we must descend through it to reach the scope) or a DESCENDANT of it (it
# is inside the scope). Comparing normalised paths keeps this separator- and
# case-insensitive, matching Normalize-Path used everywhere else.
function Test-InScope {
    param([string]$DirPath, [string]$ScopeNorm)
    if (-not $ScopeNorm) { return $true }
    $d = Normalize-Path $DirPath
    return $d.StartsWith($ScopeNorm) -or $ScopeNorm.StartsWith($d)
}

function Walk-Root {
    param([string]$Root, [bool]$IsVideo, [hashtable]$ByPath, [hashtable]$BySig, [string]$ScopeNorm = "")

    $rootLabel = if ($IsVideo) { "videoset" } else { "photoset" }
    Write-Host "  Walking $rootLabel root: $Root"

    if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
        Write-Warning "  Root does not exist: $Root"
        return [System.Collections.ArrayList]::new()
    }

    $delta      = [System.Collections.ArrayList]::new()
    $skippedLf  = 0  # leaves skipped (leaf mtime unchanged)
    $processed  = 0

    $channelFolders = Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue

    foreach ($cf in $channelFolders) {
        # Prune as early as possible: an out-of-scope channel folder costs one
        # string comparison instead of a full recursive listing.
        if (-not (Test-InScope $cf.FullName $ScopeNorm)) { continue }

        # Always use UTC for mtime comparisons — the server stores/returns UTC timestamps.
        # LastWriteTime is local time; LastWriteTimeUtc is always UTC regardless of timezone.
        $cfMtime = $cf.LastWriteTimeUtc

        $yearDirs = Get-ChildItem -LiteralPath $cf.FullName -Directory -ErrorAction SilentlyContinue

        foreach ($yf in $yearDirs) {
            if (-not (Test-InScope $yf.FullName $ScopeNorm)) { continue }
            $yrMtime = $yf.LastWriteTimeUtc

            $leafDirs = Get-ChildItem -LiteralPath $yf.FullName -Directory -ErrorAction SilentlyContinue

            foreach ($lf in $leafDirs) {
                if (-not (Test-InScope $lf.FullName $ScopeNorm)) { continue }
                $lfMtime   = $lf.LastWriteTimeUtc
                $normPath  = Normalize-Path $lf.FullName
                $folderName = $lf.Name
                $parsed    = Parse-FolderName $folderName

                $existing  = $ByPath[$normPath]  # exact path match

                # ── The metadata folder (.pulseboard\, ADR-0030) ─────────────
                # Everything tool-written lives here so the set folder holds only
                # media. The anchor's archiveKey is what lets the server recognise a
                # folder that moved to another drive; the old location is still read
                # so a folder keeps its identity mid-migration.
                $metaDir     = Join-Path $lf.FullName $META_DIR
                $metaMtime   = $null
                if (Test-Path -LiteralPath $metaDir -PathType Container) {
                    $metaMtime = (Get-Item -LiteralPath $metaDir).LastWriteTimeUtc
                }

                $sidecarKey = $null
                $sidecarObj = $null  # reset per folder so the stale-check below is clean
                $sidecarPath = Join-Path $metaDir "pulseboard.json"
                if (-not (Test-Path -LiteralPath $sidecarPath -PathType Leaf)) {
                    $sidecarPath = Join-Path $lf.FullName "_pulseboard.json"
                }
                if (Test-Path -LiteralPath $sidecarPath -PathType Leaf) {
                    try {
                        $sidecarJson = Get-Content -LiteralPath $sidecarPath -Raw -ErrorAction SilentlyContinue
                        if ($sidecarJson) {
                            $sidecarObj = $sidecarJson | ConvertFrom-Json -ErrorAction SilentlyContinue
                            if ($sidecarObj -and $sidecarObj.archiveKey) {
                                $sidecarKey = [string]$sidecarObj.archiveKey
                            }
                        }
                    } catch { <# silently ignore a malformed anchor #> }
                }

                # ── One-off: line file → markers (-MigrateCast, ADR-0030) ───
                # Runs before the markers are read, so the same scan already sends
                # what it converted. Only on request: rewriting a hand-authored file
                # is not something a routine scan should do behind your back.
                if ($MigrateCast) {
                    foreach ($legacyName in $LEGACY_HAND_FILES) {
                        $legacyHand = Join-Path $lf.FullName $legacyName
                        if (-not (Test-Path -LiteralPath $legacyHand -PathType Leaf)) { continue }

                        $made = 0
                        foreach ($mline in (Get-Content -LiteralPath $legacyHand -ErrorAction SilentlyContinue)) {
                            $mt = $mline.Trim()
                            if (-not $mt -or $mt.StartsWith("#")) { continue }
                            $lm = [regex]::Match($mt, '^(.*?)\s*\(([^()]+)\)\s*$')
                            if ($lm.Success) {
                                $lname = (($lm.Groups[1].Value -replace '_', ' ') -replace '\s+', ' ').Trim()
                                $licg  = $lm.Groups[2].Value.Trim().ToUpperInvariant()
                            } else {
                                $lname = ""
                                $licg  = $mt.ToUpperInvariant()
                            }
                            if ($licg -notmatch $ICG_ID_PATTERN) {
                                Write-Warning "  [MigrateCast] $($lf.FullName): cannot read `"$mt`""
                                $script:MigrateStats.bad++
                                continue
                            }
                            if (-not $lname) { $lname = $licg }

                            $markerName = "$lname ($licg)"
                            $markerPath = Join-Path $metaDir $markerName
                            if ($DryRun) { $made++; continue }
                            try {
                                if (-not (Test-Path -LiteralPath $metaDir -PathType Container)) {
                                    [void][System.IO.Directory]::CreateDirectory($metaDir)
                                }
                                if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
                                    # A real 0-byte file: the name is the statement,
                                    # so there is nothing to write into it.
                                    [System.IO.File]::Create($markerPath).Dispose()
                                }
                                $made++
                            } catch {
                                Write-Warning "  [MigrateCast] failed to write $markerPath`: $_"
                                $script:MigrateStats.bad++
                            }
                        }

                        # The text file goes only once every line it held has become a
                        # marker — otherwise a failed write would lose the claim.
                        if ($DryRun) {
                            Write-Host "  [DRY-RUN] Would convert $legacyName ($made marker(s)): $($lf.FullName)"
                        } elseif ($script:MigrateStats.bad -eq 0 -or $made -gt 0) {
                            try { Remove-Item -LiteralPath $legacyHand -Force } catch {
                                Write-Warning "  [MigrateCast] could not remove $legacyHand`: $_"
                            }
                        }
                        $script:MigrateStats.files++
                        $script:MigrateStats.markers += $made
                        if (Test-Path -LiteralPath $metaDir -PathType Container) {
                            $metaMtime = (Get-Item -LiteralPath $metaDir).LastWriteTimeUtc
                        }
                    }
                }

                # ── Read the cast markers (your own claims, ADR-0030) ────────
                # One empty file per person, named "Name (ICG-ID)". The name is the
                # whole statement, so content is never read and an extension makes no
                # difference — Explorer's "New → Text Document" appends .txt.
                $folderPeople       = @()
                $folderPeopleErrors = @()
                if ($metaMtime) {
                    foreach ($mf in (Get-ChildItem -LiteralPath $metaDir -File -ErrorAction SilentlyContinue)) {
                        if ($OWN_META_FILES -contains $mf.Name.ToLowerInvariant()) { continue }

                        $mname = $mf.Name
                        $pm = [regex]::Match($mname, '^(.*?)[\s_]*\(([^()]+)\)')
                        if ($pm.Success) {
                            # "Iveta_C_(IC-87VY)", "Iveta C (IC-87VY)" and the
                            # lower-cased form name the same person — the ICG-ID is
                            # the identity, the name is provenance. Only the
                            # separators are normalised; letters stay as written.
                            $pname = ($pm.Groups[1].Value -replace '_', ' ') -replace '\s+', ' '
                            $pname = $pname.Trim()
                            $picg  = $pm.Groups[2].Value.Trim().ToUpperInvariant()
                        } else {
                            $pname = ""
                            $picg  = ($mname -replace '\.[A-Za-z0-9]{1,8}$', '').Trim().ToUpperInvariant()
                        }

                        if ($picg -match $ICG_ID_PATTERN) {
                            if (-not $pname) { $pname = $picg }
                            $folderPeople += [PSCustomObject]@{ name = $pname; icgId = $picg }
                        } else {
                            # Reported, never silently dropped: that is how
                            # HTML-polluted ICG-IDs got into the data before.
                            $folderPeopleErrors += $mname
                        }
                    }
                }

                # A marker added to an existing .pulseboard\ does NOT bump the set
                # folder's mtime — NTFS only updates the direct parent — so the skip
                # below would hide it for ever. Reporting the later of the two makes
                # anything that appears in there visible on the next run.
                if ($metaMtime -and $metaMtime -gt $lfMtime) { $lfMtime = $metaMtime }

                # ── Level 3 skip: leaf mtime unchanged ──────────────────────
                # -Force disables it. Needed because NTFS does NOT bump a
                # directory's mtime when a file INSIDE it is edited — only when an
                # entry is added, removed or renamed. So a hand-edited file in an
                # otherwise untouched folder is invisible to the skip, and the only
                # way to pick it up is to re-read regardless.
                if (-not $Force -and $existing -and $existing.leafDirModifiedAt) {
                    $storedLfMtime = To-UtcDateTime $existing.leafDirModifiedAt
                    if ([Math]::Abs(($lfMtime - $storedLfMtime).TotalSeconds) -lt 2) {
                        # Still need to update parent mtimes if they changed.
                        # Always re-parse the folder name so improved regex backfills nameFormatOk.
                        $item = [PSCustomObject]@{
                            action             = "unchanged"
                            fullPath           = $lf.FullName
                            isVideo            = $IsVideo
                            fileCount          = $null
                            videoPresent       = $null
                            folderName         = $folderName
                            contentSignature   = [string]$existing.contentSignature
                            leafDirModifiedAt  = $lfMtime.ToString("o")
                            yearDirModifiedAt  = $yrMtime.ToString("o")
                            chanFolderModifiedAt = $cfMtime.ToString("o")
                            parsedDate         = $parsed.parsedDate
                            parsedShortName    = $parsed.parsedShortName
                            parsedTitle        = $parsed.parsedTitle
                            nameFormatOk       = $parsed.nameFormatOk
                            chanFolderName     = $cf.Name
                        }
                        # Include sidecarKey on unchanged items too — server uses it to backfill
                        # archiveKey on records that gained a sidecar between scans.
                        if ($sidecarKey) {
                            $item | Add-Member -NotePropertyName sidecarKey -NotePropertyValue $sidecarKey
                        }
                        if ($folderPeople.Count -gt 0) {
                            $item | Add-Member -NotePropertyName folderPeople -NotePropertyValue @($folderPeople)
                        }
                        if ($folderPeopleErrors.Count -gt 0) {
                            $item | Add-Member -NotePropertyName folderPeopleErrors -NotePropertyValue @($folderPeopleErrors)
                        }
                        # Flag stale sidecar: folderName in the JSON no longer matches the actual
                        # folder name on disk (e.g. after a case-only rename). The sidecar phase
                        # will rewrite it even if no other work is needed this scan.
                        if ($sidecarObj -and [string]$sidecarObj.folderName -cne $folderName) {
                            $item | Add-Member -NotePropertyName staleSidecar -NotePropertyValue $true
                        }
                        [void]$delta.Add($item)
                        $skippedLf++

                        if ($VerbosePreference -ne "SilentlyContinue") {
                            $sidecarTag = if ($sidecarKey) { " [sidecar:$($sidecarKey.Substring(0,8))…]" } else { "" }
                            Write-Host "        [UNCHANGED] $folderName$sidecarTag"
                        }
                        continue
                    }
                }

                # Need to read the folder
                $processed++
                $sig       = Compute-FolderSignature $lf.FullName $IsVideo
                $fileCount = Get-FileCount $lf.FullName $IsVideo
                $videoFiles = if ($IsVideo) { Get-VideoFiles $lf.FullName } else { $null }
                $videoPresent = if ($IsVideo) {
                    ($videoFiles | Where-Object {
                        [IO.Path]::GetFileNameWithoutExtension($_) -eq $folderName
                    }).Count -gt 0
                } else { $null }

                $action = "create"
                $previousFullPath = $null

                if ($existing) {
                    # Known path — content changed (mtime differed)
                    $action = "update"
                } elseif ($sidecarKey) {
                    # Unknown path but sidecar present → cross-drive MOVE detected.
                    # Server will find the existing record by archiveKey and update its path.
                    $action = "create"  # server treats create+sidecarKey as a move
                    if ($VerbosePreference -ne "SilentlyContinue") {
                        Write-Host "        [MOVE via sidecar] $folderName — key:$($sidecarKey.Substring(0,8))…"
                    }
                } elseif ($sig -ne "empty" -and $BySig.ContainsKey($sig)) {
                    # Unknown path but known signature → RENAME (same drive)
                    $action = "rename"
                    $previousFullPath = [string]$BySig[$sig].fullPath

                    if ($VerbosePreference -ne "SilentlyContinue") {
                        Write-Host "        [RENAME] $folderName"
                        Write-Host "                 was: $previousFullPath"
                    }
                } else {
                    if ($VerbosePreference -ne "SilentlyContinue") {
                        Write-Host "        [NEW] $folderName — sig:$sig files:$fileCount"
                    }
                }

                $item = [PSCustomObject]@{
                    action             = $action
                    fullPath           = $lf.FullName
                    isVideo            = $IsVideo
                    fileCount          = $fileCount
                    videoPresent       = $videoPresent
                    videoFiles         = $videoFiles
                    folderName         = $folderName
                    contentSignature   = $sig
                    leafDirModifiedAt  = $lfMtime.ToString("o")
                    yearDirModifiedAt  = $yrMtime.ToString("o")
                    chanFolderModifiedAt = $cfMtime.ToString("o")
                    parsedDate         = $parsed.parsedDate
                    parsedShortName    = $parsed.parsedShortName
                    parsedTitle        = $parsed.parsedTitle
                    nameFormatOk       = $parsed.nameFormatOk
                    chanFolderName     = $cf.Name
                }

                if ($sidecarKey) {
                    $item | Add-Member -NotePropertyName sidecarKey -NotePropertyValue $sidecarKey
                }
                if ($folderPeople.Count -gt 0) {
                    $item | Add-Member -NotePropertyName folderPeople -NotePropertyValue @($folderPeople)
                }
                if ($folderPeopleErrors.Count -gt 0) {
                    $item | Add-Member -NotePropertyName folderPeopleErrors -NotePropertyValue @($folderPeopleErrors)
                }
                if ($previousFullPath) {
                    $item | Add-Member -NotePropertyName previousFullPath -NotePropertyValue $previousFullPath
                }
                if ($sidecarObj -and [string]$sidecarObj.folderName -cne $folderName) {
                    $item | Add-Member -NotePropertyName staleSidecar -NotePropertyValue $true
                }

                [void]$delta.Add($item)
            }
        }
    }

    Write-Host "    Processed: $processed folder(s) | Unchanged (leaf mtime): $skippedLf"
    return $delta
}

# ── FULL MODE — Send ──────────────────────────────────────────────────────────

function Send-SmartBatch {
    param([System.Collections.ArrayList]$Batch)
    $body     = ConvertTo-Json -InputObject @($Batch) -Depth 6
    $response = Invoke-RestMethod `
        -Uri         "$BaseUrl/api/archive/full-ingest" `
        -Headers     $headers `
        -Method      Post `
        -Body        $body `
        -ContentType "application/json"
    return $response
}

# ── FULL MODE — Write Sidecars ────────────────────────────────────────────────

function Write-Sidecars {
    param([hashtable]$ByArchKey)

    $linked = $ByArchKey.Count
    if ($linked -eq 0) {
        Write-Host "  No archive folders with archiveKey found — nothing to write."
        return
    }

    Write-Host "  Checking $linked folder(s) for a missing or stale identity anchor..."
    $written  = 0
    $updated  = 0
    $skipped  = 0
    $errors   = 0

    foreach ($ak in $ByArchKey.Keys) {
        $rec         = $ByArchKey[$ak]
        $folderPath  = [string]$rec.fullPath

        # Skip if folder doesn't exist on this machine
        if (-not (Test-Path -LiteralPath $folderPath -PathType Container)) {
            continue
        }

        $metaDir     = Join-Path $folderPath $META_DIR
        $sidecarPath = Join-Path $metaDir "pulseboard.json"
        $legacyPath  = Join-Path $folderPath "_pulseboard.json"

        # The anchor from before the move: carry it across rather than write a second
        # copy, so the archiveKey is never re-issued and never duplicated.
        if ((Test-Path -LiteralPath $legacyPath -PathType Leaf) -and
            -not (Test-Path -LiteralPath $sidecarPath -PathType Leaf)) {
            if ($DryRun) {
                Write-Host "  [DRY-RUN] Would move anchor into $META_DIR\: $folderPath"
                $updated++
                continue
            }
            try {
                if (-not (Test-Path -LiteralPath $metaDir -PathType Container)) {
                    [void][System.IO.Directory]::CreateDirectory($metaDir)
                }
                Move-Item -LiteralPath $legacyPath -Destination $sidecarPath -Force
                $updated++
                continue
            } catch {
                Write-Warning "  Failed to move $legacyPath`: $_"
                $errors++
                continue
            }
        }

        if (Test-Path -LiteralPath $sidecarPath -PathType Leaf) {
            # Sidecar present — only touch it if folderName is stale
            $actualFolderName = Split-Path -Leaf $folderPath
            $stale      = $false
            $existingObj = $null
            try {
                $existingJson = Get-Content -LiteralPath $sidecarPath -Raw -ErrorAction SilentlyContinue
                if ($existingJson) {
                    $existingObj = $existingJson | ConvertFrom-Json -ErrorAction SilentlyContinue
                    if ($existingObj -and $existingObj.folderName -cne $actualFolderName) {
                        $stale = $true
                    }
                }
            } catch { $stale = $true }  # unreadable sidecar — rewrite it

            if (-not $stale) { $skipped++; continue }

            if ($DryRun) {
                Write-Host "  [DRY-RUN] Would update stale sidecar: $sidecarPath"
                $updated++
                continue
            }

            # Update folderName in-place — no server round-trip needed.
            # The script already knows the correct name from the filesystem walk.
            try {
                if ($existingObj) {
                    $existingObj.folderName = $actualFolderName
                    $json = ConvertTo-Json -InputObject $existingObj -Depth 4
                } else {
                    # Unreadable sidecar — fall back to fetching fresh from server
                    $content = Invoke-RestMethod -Uri "$BaseUrl/api/archive/sidecar/$ak" -Headers $headers -Method Get
                    $json = ConvertTo-Json -InputObject $content -Depth 4
                }
                [System.IO.File]::WriteAllText($sidecarPath, $json, [System.Text.Encoding]::UTF8)
                $updated++
                if ($VerbosePreference -ne "SilentlyContinue") {
                    Write-Host "  [SIDECAR UPDATE] $sidecarPath"
                }
            } catch {
                Write-Warning "  Failed to update $sidecarPath`: $_"
                $errors++
            }
            continue
        }

        # Sidecar missing — fetch full content from server and write it
        if ($DryRun) {
            Write-Host "  [DRY-RUN] Would write sidecar: $sidecarPath"
            $written++
            continue
        }

        try {
            $content = Invoke-RestMethod `
                -Uri     "$BaseUrl/api/archive/sidecar/$ak" `
                -Headers $headers `
                -Method  Get
        } catch {
            if ($VerbosePreference -ne "SilentlyContinue") {
                Write-Warning "  Failed to fetch sidecar for $ak`: $_"
            }
            $errors++
            continue
        }

        try {
            if (-not (Test-Path -LiteralPath $metaDir -PathType Container)) {
                [void][System.IO.Directory]::CreateDirectory($metaDir)
            }
            $json = ConvertTo-Json -InputObject $content -Depth 4
            [System.IO.File]::WriteAllText($sidecarPath, $json, [System.Text.Encoding]::UTF8)
            $written++
            if ($VerbosePreference -ne "SilentlyContinue") {
                Write-Host "  [SIDECAR] $sidecarPath"
            }
        } catch {
            Write-Warning "  Failed to write $sidecarPath`: $_"
            $errors++
        }
    }

    $summary = "  Sidecars written: $written | Updated (stale): $updated | Already current: $skipped"
    if ($errors -gt 0) { $summary += " | Errors: $errors" }
    Write-Host $summary
}

# ── FULL MODE — Write people files ────────────────────────────────────────────
#
# `.pulseboard\cast.json` per folder: who the app knows is in this set, so the
# archive can answer that question with no app, no database and no MinIO running
# (ADR-0029). Plain text on purpose — ConvertTo-Json collapses a one-element array
# into a scalar, and a participant list is exactly that shape.

function Write-PeopleFiles {
    param([hashtable]$ByArchKey)

    if ($ByArchKey.Count -eq 0) { return }

    # One round trip for every folder's fingerprint. Comparing it against the header
    # on disk is what stops these files decaying the way _pulseboard.json did:
    # written once, then quietly wrong for months.
    try {
        $revResponse = Invoke-RestMethod -Uri "$BaseUrl/api/archive/people-revisions" -Headers $headers -Method Get
    } catch {
        Write-Warning "  Could not fetch people revisions: $_"
        return
    }

    $wanted = @{}
    foreach ($r in $revResponse.revisions) { $wanted[[string]$r.archiveKey] = [string]$r.revision }

    $needed   = [System.Collections.ArrayList]::new()
    $toDelete = [System.Collections.ArrayList]::new()
    $matched  = 0

    foreach ($ak in $ByArchKey.Keys) {
        $folderPath = [string]$ByArchKey[$ak].fullPath
        if (-not (Test-Path -LiteralPath $folderPath -PathType Container)) { continue }
        $filePath = Join-Path $folderPath $META_DIR "cast.json"
        $want     = if ($wanted.ContainsKey($ak)) { $wanted[$ak] } else { "EMPTY" }
        $exists   = Test-Path -LiteralPath $filePath -PathType Leaf

        # EMPTY means the app knows nobody here. A file that has outlived its
        # content is worse than none: it answers with a stand nobody holds. Any
        # generated file from before the move into .pulseboard\ goes the same way.
        foreach ($legacyName in $LEGACY_CAST_FILES) {
            $legacyPath = Join-Path $folderPath $legacyName
            if (Test-Path -LiteralPath $legacyPath -PathType Leaf) { [void]$toDelete.Add($legacyPath) }
        }

        if ($want -eq "EMPTY") {
            if ($exists) { [void]$toDelete.Add($filePath) }
            continue
        }

        $have = $null
        if ($exists) {
            foreach ($line in (Get-Content -LiteralPath $filePath -TotalCount 12 -ErrorAction SilentlyContinue)) {
                $rm = [regex]::Match($line, '^#\s*revision\s*:\s*(\S+)\s*$')
                if ($rm.Success) { $have = $rm.Groups[1].Value; break }
            }
        }

        if ($have -eq $want) { $matched++ } else { [void]$needed.Add($ak) }
    }

    if ($DryRun) {
        Write-Host "  [DRY-RUN] Would write/update $($needed.Count), delete $($toDelete.Count), leave $matched unchanged."
        return
    }

    $written = 0
    $deleted = 0
    $errors  = 0

    # Bodies come in batches: a few hundred UUIDs is a request, not a query string.
    for ($i = 0; $i -lt $needed.Count; $i += 200) {
        $chunk = @($needed[$i..([Math]::Min($i + 199, $needed.Count - 1))])
        try {
            $payload  = ConvertTo-Json -InputObject @{ archiveKeys = $chunk } -Depth 3
            $response = Invoke-RestMethod `
                -Uri "$BaseUrl/api/archive/people-files" `
                -Headers $headers -Method Post -Body $payload -ContentType "application/json"
        } catch {
            Write-Warning "  Failed to fetch people files: $_"
            $errors += $chunk.Count
            continue
        }

        foreach ($file in $response.files) {
            $ak = [string]$file.archiveKey
            if (-not $ByArchKey.ContainsKey($ak)) { continue }
            $folderPath = [string]$ByArchKey[$ak].fullPath
            $metaDir    = Join-Path $folderPath $META_DIR
            $filePath   = Join-Path $metaDir "cast.json"
            try {
                if (-not (Test-Path -LiteralPath $metaDir -PathType Container)) {
                    [void][System.IO.Directory]::CreateDirectory($metaDir)
                }
                if ($null -eq $file.body) {
                    if (Test-Path -LiteralPath $filePath -PathType Leaf) {
                        Remove-Item -LiteralPath $filePath -Force
                        $deleted++
                    }
                } else {
                    [System.IO.File]::WriteAllText($filePath, [string]$file.body, [System.Text.Encoding]::UTF8)
                    $written++
                }
            } catch {
                Write-Warning "  Failed to write $filePath`: $_"
                $errors++
            }
        }
    }

    foreach ($filePath in $toDelete) {
        try {
            Remove-Item -LiteralPath $filePath -Force
            $deleted++
        } catch {
            Write-Warning "  Failed to delete $filePath`: $_"
            $errors++
        }
    }

    $summary = "  Cast files written: $written | Deleted: $deleted | Already current: $matched"
    if ($errors -gt 0) { $summary += " | Errors: $errors" }
    Write-Host $summary
}

# ── FULL MODE — Write the per-root index ──────────────────────────────────────
#
# Convenience, explicitly derived: one file per archive root that answers "which
# sets has this person worked on" in a single grep, and can be copied off on its
# own. Built by reading the per-folder files back, so it can never claim something
# they do not — if it looks wrong, delete it and grep the folders.

function Write-PeopleIndex {
    param([hashtable]$ByArchKey, [string[]]$Roots)

    if ($Roots.Count -eq 0) { return }

    $rowsByRoot = @{}
    foreach ($root in $Roots) { $rowsByRoot[$root] = [System.Collections.ArrayList]::new() }

    foreach ($ak in $ByArchKey.Keys) {
        $folderPath = [string]$ByArchKey[$ak].fullPath
        $filePath   = Join-Path $folderPath $META_DIR "cast.json"
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) { continue }

        $root = $null
        foreach ($r in $Roots) {
            if ($folderPath.ToLowerInvariant().StartsWith($r.TrimEnd("/\").ToLowerInvariant())) { $root = $r; break }
        }
        if (-not $root) { continue }
        $relative = $folderPath.Substring($root.TrimEnd("/\").Length).TrimStart("/\")

        # Reading JSON is safe — the one-element collapse is a serialisation bug, and
        # nothing here serialises. Only folders that HAVE a cast file are parsed.
        try {
            $cast = Get-Content -LiteralPath $filePath -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction Stop
        } catch {
            continue
        }
        if (-not $cast) { continue }

        foreach ($standing in @("credited", "claimed")) {
            foreach ($person in @($cast.$standing)) {
                if (-not $person -or -not $person.icgId) { continue }
                $nm = if ($person.name) { [string]$person.name } else { [string]$person.icgId }
                [void]$rowsByRoot[$root].Add("$([string]$person.icgId)`t$nm`t$standing`t$relative")
            }
        }
    }

    foreach ($root in $Roots) {
        $rows = $rowsByRoot[$root]
        if ($rows.Count -eq 0) { continue }
        $indexDir  = Join-Path $root $META_DIR
        $indexPath = Join-Path $indexDir "index.tsv"
        if ($DryRun) {
            Write-Host "  [DRY-RUN] Would write $indexPath ($($rows.Count) rows)"
            continue
        }
        try {
            if (-not (Test-Path -LiteralPath $indexDir -PathType Container)) {
                [void][System.IO.Directory]::CreateDirectory($indexDir)
            }
            $header = @(
                "# pulseboard — generated index, derived from $META_DIR\cast.json. Delete it and grep the folders if in doubt.",
                "# generated: $((Get-Date).ToUniversalTime().ToString('o'))",
                "# rows: $($rows.Count)",
                "# icgId`tname`tstanding`trelativePath"
            )
            [System.IO.File]::WriteAllLines($indexPath, @($header + @($rows | Sort-Object)), [System.Text.Encoding]::UTF8)
            Write-Host "  Index: $indexPath ($($rows.Count) rows)"

            # The index from before the move sat at the root itself.
            $legacyIndex = Join-Path $root "_pulseboard_index.tsv"
            if (Test-Path -LiteralPath $legacyIndex -PathType Leaf) { Remove-Item -LiteralPath $legacyIndex -Force }
        } catch {
            Write-Warning "  Failed to write $indexPath`: $_"
        }
    }
}

function Run-FullScan {
    Write-Host "Mode: Full (smart — with mtime skip + rename detection)"
    Write-Host ""

    # ── Phase 0: Targeted scan — keep confirmed link file counts current ──────
    # It runs BEFORE the walk, so it checks the paths the app currently records. Just
    # after folders were moved between roots, every one of them is reported MISSING —
    # true of the old path, but about to be corrected by the walk a minute later.
    # -SkipTargeted avoids writing that transient verdict at all.
    if ($SkipTargeted) {
        Write-Host "Targeted sub-phase skipped (-SkipTargeted) — the walk will refresh the paths."
    } else {
        Run-TargetedScan -AsSubPhase
    }
    Write-Host ""

    # Capture scan start time before any filesystem walk so ghost detection is accurate
    $scanStartedAt = (Get-Date).ToUniversalTime().ToString('o')

    # ── Step 1: Preload known folders ────────────────────────────────────────
    $byPath, $bySig, $byArchKey = Load-KnownFolders
    Write-Host ""

    # ── Step 2: Walk roots ───────────────────────────────────────────────────
    $allDelta = [System.Collections.ArrayList]::new()

    $photoRoots = Parse-Roots $PhotosetRoot
    $videoRoots = Parse-Roots $VideosetRoot

    $scopeNorm = if ($Path) { Normalize-Path ($Path.TrimEnd("/\")) } else { "" }

    foreach ($root in $photoRoots) {
        $r = $root.TrimEnd("/\")
        if (-not (Test-InScope $r $scopeNorm)) { Write-Host "  [Photo] Skipping (out of scope): $r"; continue }
        Write-Host "  [Photo] Walking: $r"
        $found = Walk-Root -Root $r -IsVideo $false -ByPath $byPath -BySig $bySig -ScopeNorm $scopeNorm
        foreach ($f in $found) { [void]$allDelta.Add($f) }
    }

    foreach ($root in $videoRoots) {
        $r = $root.TrimEnd("/\")
        if (-not (Test-InScope $r $scopeNorm)) { Write-Host "  [Video] Skipping (out of scope): $r"; continue }
        Write-Host "  [Video] Walking: $r"
        $found = Walk-Root -Root $r -IsVideo $true -ByPath $byPath -BySig $bySig -ScopeNorm $scopeNorm
        foreach ($f in $found) { [void]$allDelta.Add($f) }
    }

    $totalDelta = $allDelta.Count
    $creates   = @($allDelta | Where-Object { $_.action -eq 'create' }).Count
    $updates   = @($allDelta | Where-Object { $_.action -eq 'update' }).Count
    $renames   = @($allDelta | Where-Object { $_.action -eq 'rename' }).Count
    $unchanged = @($allDelta | Where-Object { $_.action -eq 'unchanged' }).Count

    Write-Host ""
    Write-Host "Delta summary:"
    Write-Host ("  New:       " + $creates)
    Write-Host ("  Changed:   " + $updates)
    Write-Host ("  Renamed:   " + $renames)
    Write-Host ("  Unchanged: $unchanged (mtime-only update)")
    Write-Host ("  Total items to send: " + $totalDelta)

    if ($DryRun) {
        Write-Host ""
        if ($totalDelta -eq 0) {
            Write-Host "Dry-run: nothing to send (no folders found)."
        } else {
            Write-Host "Dry-run: would send $totalDelta item(s) in batches of $BatchSize"
            $preview = [System.Collections.ArrayList]::new()
            for ($i = 0; $i -lt [Math]::Min(3, $totalDelta); $i++) {
                [void]$preview.Add($allDelta[$i])
            }
            Write-Host "First items preview:"
            ConvertTo-Json -InputObject @($preview) -Depth 6 | Write-Host
        }
        # Fall through to the write phases rather than returning here. They are
        # read-only under -DryRun and they are usually the ones being tested — a
        # dry run that stays silent about them is not a dry run. (The sidecar
        # phase's own [DRY-RUN] branch was unreachable for exactly this reason.)
        $staleSidecar = 0
        foreach ($item in $allDelta) {
            if ($item.staleSidecar -eq $true -and
                (Test-Path -LiteralPath ([string]$item.fullPath) -PathType Container)) {
                $staleSidecar++
            }
        }
        Write-WritePhases -ByArchKey $byArchKey -ScopeNorm $scopeNorm -StaleSidecar $staleSidecar
        return
    }

    # ── Step 3: POST delta in batches (skip if nothing to send) ─────────────
    $totCre = 0; $totUpd = 0; $totRen = 0; $totUnch = 0; $totSkip = 0
    $allKeyConflicts = [System.Collections.ArrayList]::new()

    if ($totalDelta -eq 0) {
        Write-Host ""
        Write-Host "No folders found in walk roots — skipping POST."
    } else {
        Write-Host ""
        Write-Host "Sending delta in batches of $BatchSize..."

        $sent      = 0
        $batchNum  = 0

        while ($sent -lt $totalDelta) {
            $batchNum++
            $end   = [Math]::Min($sent + $BatchSize, $totalDelta)
            $batch = [System.Collections.ArrayList]::new()
            for ($i = $sent; $i -lt $end; $i++) {
                [void]$batch.Add($allDelta[$i])
            }

            try {
                $resp = Send-SmartBatch -Batch $batch
                $totCre  += [int]$resp.created
                $totUpd  += [int]$resp.updated
                $totRen  += [int]$resp.renamed
                $totUnch += [int]$resp.unchanged
                $totSkip += [int]$resp.skipped
                # Accumulate any sidecar key conflicts reported by the server
                if ($resp.keyConflicts -and $resp.keyConflicts.Count -gt 0) {
                    foreach ($kc in $resp.keyConflicts) {
                        [void]$allKeyConflicts.Add($kc)
                    }
                }
                $pct = [Math]::Round(($end / $totalDelta) * 100)
                Write-Host "  Batch $batchNum`: sent $($batch.Count) — $pct% complete"
            } catch {
                Write-Error "Batch $batchNum failed: $_"; exit 1
            }

            $sent += $end - $sent
        }

        Write-Host ""
        Write-Host "── Summary ────────────────────────────────────"
        Write-Host ("  New:              " + $totCre)
        Write-Host ("  Updated:          " + $totUpd)
        Write-Host ("  Renamed:          " + $totRen)
        Write-Host ("  Unchanged (mtime):" + $totUnch)
        if ($totSkip -gt 0) { Write-Host ("  Skipped (empty):  " + $totSkip) }
        if ($totCre -gt 0) {
            Write-Host "  Matching pass:    running in background on server"
        }
        Write-Host "────────────────────────────────────────────────"

        # ── Key conflict report ──────────────────────────────────────────────
        if ($allKeyConflicts.Count -gt 0) {
            Write-Host ""
            Write-Warning "⚠  SIDECAR KEY CONFLICTS DETECTED ($($allKeyConflicts.Count)):"
            Write-Warning "   Two on-disk folders share the same archiveKey UUID."
            Write-Warning "   Duplicate sidecars must be resolved manually:"
            Write-Warning "   — delete the _pulseboard.json from the COPY folder,"
            Write-Warning "   — then re-run a Full scan so the copy gets a fresh key."
            Write-Host ""
            foreach ($kc in $allKeyConflicts) {
                Write-Warning "  Key: $($kc.sidecarKey)"
                Write-Warning "    Existing owner : $($kc.conflictingPath)"
                Write-Warning "    Also claims key: $($kc.currentPath)"
                Write-Host ""
            }
        }

        # If new folders were created, refresh byArchKey to include their freshly-
        # assigned archiveKeys so the sidecar phase can write them in this same run.
        if ($totCre -gt 0) {
            Write-Host ""
            Write-Host "New folders registered — refreshing index to pick up new archiveKeys..."
            $_rp, $_rs, $byArchKey = Load-KnownFolders
        }
    }

    # ── Sync $byArchKey paths from delta ─────────────────────────────────────
    # Case-only renames in the SAME scan run: $byArchKey has the OLD path from
    # the preload while $item.fullPath is the current disk path. Sync it so the
    # sidecar phase can find the folder. (Subsequent scans: DB already has the
    # new path, so $byArchKey and delta agree — this loop is a no-op.)
    foreach ($item in $allDelta) {
        $sk = [string]$item.sidecarKey
        if ($sk -and $byArchKey.ContainsKey($sk)) {
            $oldPath = [string]$byArchKey[$sk].fullPath
            if ($oldPath -ne $item.fullPath) {
                $byArchKey[$sk].fullPath = $item.fullPath
            }
        }
    }

    # ── Step 4: Mark ghost folders (not seen this scan) ─────────────────────
    # HARD SAFETY GATE. mark-ghosts flags EVERY folder whose scannedAt predates
    # this run as missingOnDisk — it assumes the walk covered the whole archive.
    # A -Path run covers a subtree, so calling it would mark the tens of thousands
    # of folders outside the scope as missing, which in turn makes them ineligible
    # for the HD re-bake and hides them in the workspace. A scoped scan makes no
    # claim about anything outside its scope, so it must not run this step.
    Write-Host ""
    if ($Path) {
        Write-Host "Skipping ghost detection — scan was restricted to: $Path"
        Write-Host "  (deletions are only detected by an unrestricted Full scan)"
    } else {
    Write-Host "Marking ghost folders..."
    try {
        $ghostBody = ConvertTo-Json @{ scanStartedAt = $scanStartedAt } -Compress
        $ghostResp = Invoke-RestMethod `
            -Uri         "$BaseUrl/api/archive/mark-ghosts" `
            -Method      Post `
            -Headers     $headers `
            -Body        $ghostBody `
            -ContentType 'application/json'
        Write-Host "  Marked $($ghostResp.marked) ghost folder(s) as missing on disk."
    } catch {
        Write-Warning "mark-ghosts call failed: $_"
    }
    }

    # ── Steps 5 + 6: Write sidecars and people files ────────────────────────
    # Stale sidecars are detected during the walk: any folder whose sidecar names a
    # folder that no longer matches gets staleSidecar=$true on its delta item.
    $staleSidecar = 0
    foreach ($item in $allDelta) {
        if ($item.staleSidecar -eq $true -and
            (Test-Path -LiteralPath ([string]$item.fullPath) -PathType Container)) {
            $staleSidecar++
        }
    }

    Write-WritePhases -ByArchKey $byArchKey -ScopeNorm $scopeNorm -StaleSidecar $staleSidecar

    if ($MigrateCast) {
        Write-Host ""
        Write-Host "  Cast migration: $($script:MigrateStats.files) file(s) converted into $($script:MigrateStats.markers) marker(s)$(if ($script:MigrateStats.bad -gt 0) { " | unreadable lines: $($script:MigrateStats.bad)" })"
    }
}

# ── Main ──────────────────────────────────────────────────────────────────────

Write-Host "Archive scan — base URL: $BaseUrl"
if ($Tenant) { Write-Host "Tenant: $Tenant" }
if ($DryRun) { Write-Host "(dry-run mode — no changes will be written)" }
Write-Host ""

switch ($Mode) {
    'Targeted' { Run-TargetedScan }
    'Full'     { Run-FullScan }
}

# ── Optional: HD re-bake pass (ADR-0017) ───────────────────────────────────────
# Run after the scan so the archive paths it reads are freshly verified.
if ($Rebake) {
    Write-Host ""
    Write-Host "── HD re-bake (post-scan) ──────────────────────────────────"
    $rebakeScript = Join-Path $PSScriptRoot "archive-rebake.ps1"
    if (-not (Test-Path -LiteralPath $rebakeScript -PathType Leaf)) {
        Write-Warning "archive-rebake.ps1 not found next to this script — skipping re-bake."
    } else {
        $rebakeArgs = @{ BaseUrl = $BaseUrl; ApiKey = $ApiKey }
        if ($Tenant)      { $rebakeArgs["Tenant"] = $Tenant }
        if ($DryRun)      { $rebakeArgs["DryRun"] = $true }
        if ($RebakeForce) { $rebakeArgs["Force"]  = $true }
        & $rebakeScript @rebakeArgs
    }
}
