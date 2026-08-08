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

    People files (_pulseboard_people.txt) — ADR-0029:
      Written after each Full scan (skip with -SkipPeople). Holds who the app knows
      is in this set, so the archive answers that without app, database or MinIO:
        # credited  — the cast of the linked set (who the publisher named)
        # claimed   — the folder's own attributions (what you asserted)
      Refreshed by comparing the file's `# revision:` header against the server;
      deleted when the app knows nobody. A per-root _pulseboard_index.tsv is
      generated from these files for one-grep lookup — derived, safe to delete.

    Folder attribution (_people.txt) — hand-written, read-only to the app:
      One `Common Name (ICG-ID)` per line; # comments and blank lines ignored.
      Read on every visit and sent with the folder, where it becomes a top-ranked
      suggestion. It only ever ADDS: removing a line takes nothing back.
      NOTE: an *edited* _people.txt is invisible to the leaf-mtime skip, because
      NTFS does not bump a directory's mtime when a file inside it changes. Use
      -Force (with -Path to scope it) after editing one.

    Content signature (rename fingerprint):
      SHA256(sorted "filename:filesize" strings, "|"-delimited), first 16 hex chars.
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
    [switch]$SkipPeople,       # Full mode: skip writing _pulseboard_people.txt and the per-root index
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
                    (Get-ChildItem -LiteralPath $framesDir -File -ErrorAction SilentlyContinue).Count
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
                $fileCount = (Get-ChildItem -LiteralPath $ArchivePath -File -ErrorAction SilentlyContinue).Count
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
        Write-Host ""; Write-Host "Dry-run: would send:"
        ConvertTo-Json -InputObject @($results) -Depth 5 | Write-Host
    } else {
        Write-Host ""; Write-Host "Sending scan results..."
        try {
            $body = ConvertTo-Json -InputObject @($results) -Depth 5
            $response = Invoke-RestMethod -Uri "$BaseUrl/api/archive/ingest" -Headers $headers `
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
            return (Get-ChildItem -LiteralPath $framesDir -File -ErrorAction SilentlyContinue).Count
        }
        return 0
    }
    return (Get-ChildItem -LiteralPath $FolderPath -File -ErrorAction SilentlyContinue).Count
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

                # ── Read sidecar (_pulseboard.json) ──────────────────────────
                # The sidecar contains a stable archiveKey UUID written by a previous
                # scan pass. Sending it lets the server detect cross-drive folder moves
                # (action=create with sidecarKey → server finds existing record by key).
                $sidecarKey = $null
                $sidecarObj = $null  # reset per folder so stale-check below is clean
                $sidecarPath = Join-Path $lf.FullName "_pulseboard.json"
                if (Test-Path -LiteralPath $sidecarPath -PathType Leaf) {
                    try {
                        $sidecarJson = Get-Content -LiteralPath $sidecarPath -Raw -ErrorAction SilentlyContinue
                        if ($sidecarJson) {
                            $sidecarObj = $sidecarJson | ConvertFrom-Json -ErrorAction SilentlyContinue
                            if ($sidecarObj -and $sidecarObj.archiveKey) {
                                $sidecarKey = [string]$sidecarObj.archiveKey
                            }
                        }
                    } catch { <# silently ignore malformed sidecar #> }

                # ── Read _people.txt (hand-written claims, ADR-0029) ─────────
                # Your own assertion about who is in this set. Read on every visit
                # to a leaf — but note that an *edited* file is invisible to the
                # leaf-mtime skip below, because NTFS does not bump a directory's
                # mtime when a file inside it changes. Picking up an edit needs
                # -Force (with -Path to scope it).
                $folderPeople       = @()
                $folderPeopleErrors = @()
                $peoplePath = Join-Path $lf.FullName "_people.txt"
                if (Test-Path -LiteralPath $peoplePath -PathType Leaf) {
                    foreach ($pline in (Get-Content -LiteralPath $peoplePath -ErrorAction SilentlyContinue)) {
                        $ptrim = $pline.Trim()
                        if (-not $ptrim -or $ptrim.StartsWith("#")) { continue }
                        $pm = [regex]::Match($ptrim, '^(.*?)\s*\(([^()]+)\)\s*$')
                        if ($pm.Success) {
                            $pname = $pm.Groups[1].Value.Trim()
                            $picg  = $pm.Groups[2].Value.Trim().ToUpperInvariant()
                        } else {
                            $pname = ""
                            $picg  = $ptrim.ToUpperInvariant()
                        }
                        if ($picg -match '^[A-Z]{2}-[0-9]{2}[A-Z0-9@][A-Z0-9]+$') {
                            if (-not $pname) { $pname = $picg }
                            $folderPeople += [PSCustomObject]@{ name = $pname; icgId = $picg }
                        } else {
                            # Reported, never silently dropped: that is how
                            # HTML-polluted ICG-IDs got into the data before.
                            $folderPeopleErrors += $ptrim
                        }
                    }
                }
                }

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

    Write-Host "  Checking $linked folder(s) for missing or stale _pulseboard.json..."
    $written  = 0
    $updated  = 0
    $skipped  = 0
    $errors   = 0

    foreach ($ak in $ByArchKey.Keys) {
        $rec         = $ByArchKey[$ak]
        $folderPath  = [string]$rec.fullPath
        $sidecarPath = Join-Path $folderPath "_pulseboard.json"

        # Skip if folder doesn't exist on this machine
        if (-not (Test-Path -LiteralPath $folderPath -PathType Container)) {
            continue
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
# `_pulseboard_people.txt` per folder: who the app knows is in this set, so the
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
        $filePath = Join-Path $folderPath "_pulseboard_people.txt"
        $want     = if ($wanted.ContainsKey($ak)) { $wanted[$ak] } else { "EMPTY" }
        $exists   = Test-Path -LiteralPath $filePath -PathType Leaf

        # EMPTY means the app knows nobody here. A file that has outlived its
        # content is worse than none: it answers with a stand nobody holds.
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
            $filePath = Join-Path ([string]$ByArchKey[$ak].fullPath) "_pulseboard_people.txt"
            try {
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

    $summary = "  People files written: $written | Deleted: $deleted | Already current: $matched"
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
        $filePath   = Join-Path $folderPath "_pulseboard_people.txt"
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) { continue }

        $root = $null
        foreach ($r in $Roots) {
            if ($folderPath.ToLowerInvariant().StartsWith($r.TrimEnd("/\").ToLowerInvariant())) { $root = $r; break }
        }
        if (-not $root) { continue }
        $relative = $folderPath.Substring($root.TrimEnd("/\").Length).TrimStart("/\")

        $standing = "claimed"
        foreach ($line in (Get-Content -LiteralPath $filePath -ErrorAction SilentlyContinue)) {
            $t = $line.Trim()
            if (-not $t) { continue }
            if ($t.StartsWith("#")) {
                if ($t -match '^#\s*credited\s*$') { $standing = "credited" }
                elseif ($t -match '^#\s*claimed\s*$') { $standing = "claimed" }
                continue
            }
            $m = [regex]::Match($t, '^(.*?)\s*\(([^()]+)\)\s*$')
            if ($m.Success) {
                $nm  = $m.Groups[1].Value.Trim()
                $icg = $m.Groups[2].Value.Trim()
            } else {
                $nm  = $t
                $icg = $t
            }
            [void]$rowsByRoot[$root].Add("$icg`t$nm`t$standing`t$relative")
        }
    }

    foreach ($root in $Roots) {
        $rows = $rowsByRoot[$root]
        if ($rows.Count -eq 0) { continue }
        $indexPath = Join-Path $root "_pulseboard_index.tsv"
        if ($DryRun) {
            Write-Host "  [DRY-RUN] Would write $indexPath ($($rows.Count) rows)"
            continue
        }
        try {
            $header = @(
                "# pulseboard — generated index, derived from _pulseboard_people.txt. Delete it and grep the folders if in doubt.",
                "# generated: $((Get-Date).ToUniversalTime().ToString('o'))",
                "# rows: $($rows.Count)",
                "# icgId`tname`tstanding`trelativePath"
            )
            [System.IO.File]::WriteAllLines($indexPath, @($header + @($rows | Sort-Object)), [System.Text.Encoding]::UTF8)
            Write-Host "  Index: $indexPath ($($rows.Count) rows)"
        } catch {
            Write-Warning "  Failed to write $indexPath`: $_"
        }
    }
}

function Run-FullScan {
    Write-Host "Mode: Full (smart — with mtime skip + rename detection)"
    Write-Host ""

    # ── Phase 0: Targeted scan — keep confirmed link file counts current ──────
    Run-TargetedScan -AsSubPhase
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

    # ── Step 5: Write sidecar files ─────────────────────────────────────────
    # Count folders that need a new sidecar (missing) or an updated one (stale).
    # Stale sidecars are detected during the walk: any folder where the sidecar's
    # folderName no longer matches the actual folder name gets staleSidecar=$true.
    $needsSidecar = 0
    foreach ($ak in $byArchKey.Keys) {
        $folderPath  = [string]$byArchKey[$ak].fullPath
        $sidecarPath = Join-Path $folderPath "_pulseboard.json"
        if ((Test-Path -LiteralPath $folderPath -PathType Container) -and
            -not (Test-Path -LiteralPath $sidecarPath -PathType Leaf)) {
            $needsSidecar++
        }
    }
    $staleSidecar = 0
    foreach ($item in $allDelta) {
        if ($item.staleSidecar -eq $true -and
            (Test-Path -LiteralPath ([string]$item.fullPath) -PathType Container)) {
            $staleSidecar++
        }
    }
    $totalSidecarWork = $needsSidecar + $staleSidecar

    if ($totalSidecarWork -gt 0) {
        Write-Host ""
        $promptMsg = if ($needsSidecar -gt 0 -and $staleSidecar -gt 0) {
            "Write/update sidecars? ($needsSidecar missing, $staleSidecar stale) [Y/n]"
        } elseif ($needsSidecar -gt 0) {
            "Write _pulseboard.json into $needsSidecar folder(s) missing a sidecar? [Y/n]"
        } else {
            "Update $staleSidecar stale _pulseboard.json file(s) with new folder name? [Y/n]"
        }

        if ($NoSidecarPrompt -or $DryRun) {
            $doWrite = $true
        } else {
            $answer  = Read-Host $promptMsg
            $doWrite = ($answer -eq "" -or $answer -match "^[Yy]")
        }

        if ($doWrite) {
            Write-Host "Writing sidecar files (_pulseboard.json)..."
            Write-Sidecars -ByArchKey $byArchKey
        } else {
            Write-Host "  Sidecar write skipped."
        }
    } else {
        Write-Host ""
        Write-Host "All on-disk folders already have _pulseboard.json — nothing to write."
    }

    # ── Step 6: People files (ADR-0029) ─────────────────────────────────────
    # No prompt: unlike a sidecar these are refreshed constantly by design, and a
    # question asked every run is a question nobody reads.
    if (-not $SkipPeople) {
        Write-Host ""
        Write-Host "Writing people files (_pulseboard_people.txt)..."
        Write-PeopleFiles -ByArchKey $byArchKey
        Write-PeopleIndex -ByArchKey $byArchKey -Roots @(@(Parse-Roots $PhotosetRoot) + @(Parse-Roots $VideosetRoot))
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
