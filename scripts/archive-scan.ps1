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
        - Compares the folder's LastWriteTime against the stored value at all three
          levels (channelFolder / year / leaf) to decide whether to skip reading the
          directory entirely.
        - Classifies each folder as: create (new), update (changed), rename (path
          changed but signature matches known folder), or unchanged (nothing changed).
        - Sends only the delta (changed/new/renamed folders) to the server in batches.
          Unchanged subtrees are skipped without any network traffic.

        The server handles rename propagation: if a renamed folder was linked to a
        Set or StagingSet, the archivePath on that record is automatically updated.

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
    Requires PowerShell 5.1 or later (Windows 10/11 built-in).
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

    Content signature (rename fingerprint):
      SHA256(sorted "filename:filesize" strings, "|"-delimited), first 16 hex chars.
      Photosets: files in leaf folder root.
      Videosets: files in frames\ subfolder.
      Stable across: rename, move, copy+delete (file names/sizes preserved).
      Changes when: files added/removed/renamed inside the folder.

    Skip logic (directory LastWriteTime comparison):
      chanFolderModifiedAt unchanged → skip all year dirs inside (0 reads)
      yearDirModifiedAt unchanged    → skip all leaf dirs inside (0 reads)
      leafDirModifiedAt unchanged    → skip file listing (action = unchanged)

    Note: moving a leaf between channel folders updates the YEAR dir mtime but NOT the
    chanFolder mtime (NTFS only updates the direct parent). Use -SkipChanCache after
    moving folders between channel dirs so the scan descends to the year level.
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
    [switch]$NoSidecarPrompt,  # skip interactive sidecar-write prompt after Full scan (for automation)
    [switch]$DryRun,
    [switch]$SkipChanCache   # bypass chanFolder-level mtime skip; use after moving folders between channels
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

$BaseUrl = $BaseUrl.TrimEnd("/")

# ── Request headers ───────────────────────────────────────────────────────────

$headers = @{ "x-archive-key" = $ApiKey }
if ($Tenant) { $headers["x-tenant-id"] = $Tenant }

# ── Shared helpers ────────────────────────────────────────────────────────────

$VideoExtensions = @(".mp4", ".wmv", ".mkv", ".avi", ".mov")

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
    param([string]$Id, [string]$Type, [string]$ArchivePath, [bool]$IsVideo, [string]$FolderName)

    $exists = $false; $fileCount = $null; $videoPresent = $null; $errorMsg = $null

    try {
        if (Test-Path -LiteralPath $ArchivePath -PathType Container) {
            $exists = $true
            if ($IsVideo) {
                $framesDir = Join-Path $ArchivePath "frames"
                $fileCount = if (Test-Path -LiteralPath $framesDir -PathType Container) {
                    (Get-ChildItem -LiteralPath $framesDir -File).Count
                } else { 0 }
                $videoFound = $false
                foreach ($ext in $VideoExtensions) {
                    if (Test-Path -LiteralPath (Join-Path $ArchivePath ($FolderName + $ext)) -PathType Leaf) {
                        $videoFound = $true; break
                    }
                }
                $videoPresent = $videoFound
            } else {
                $fileCount = (Get-ChildItem -LiteralPath $ArchivePath -File).Count
            }
        }
    } catch {
        $exists = $false; $fileCount = $null; $errorMsg = $_.Exception.Message
    }

    return [PSCustomObject]@{
        id = $Id; type = $Type; path = $ArchivePath
        exists = $exists; fileCount = $fileCount; videoPresent = $videoPresent; error = $errorMsg
    }
}

function Get-TargetedStatusLabel { param($R)
    if ($R.error) { return "ERROR" }
    if (-not $R.exists) { return "MISSING" }
    if ($R.videoPresent -eq $false) { return "INCOMPLETE" }
    return "OK"
}

function Run-TargetedScan {
    Write-Host "Mode: Targeted"
    Write-Host ""
    Write-Host "Fetching known archive paths..."
    try {
        $entries = @(Invoke-RestMethod -Uri "$BaseUrl/api/archive/paths" -Headers $headers -Method Get)
    } catch {
        Write-Error "Failed to fetch paths: $_"; exit 1
    }

    $total = $entries.Count
    Write-Host "  Found $total path(s) to check"
    if ($total -eq 0) { Write-Host "Nothing to scan."; exit 0 }

    $entries = $entries | ForEach-Object {
        if ($_ -is [System.Collections.Hashtable]) { [PSCustomObject]$_ } else { $_ }
    }

    $results = [System.Collections.ArrayList]::new()
    $counts  = @{ ok = 0; incomplete = 0; missing = 0; error = 0 }

    foreach ($entry in $entries) {
        $result = Check-ArchivePath `
            -Id ([string]$entry.id) -Type ([string]$entry.type) `
            -ArchivePath ([string]$entry.path) -IsVideo ([bool]$entry.isVideo) `
            -FolderName ([string]$entry.folderName)

        [void]$results.Add($result)
        $label = Get-TargetedStatusLabel $result

        if ($VerbosePreference -ne "SilentlyContinue") {
            Write-Host "  [$label] $($entry.path)"
            if ($entry.isVideo) {
                Write-Host "          video file expected: $($entry.folderName).{$($VideoExtensions -join ', ')}"
                Write-Host "          video present: $($result.videoPresent) — frames: $($result.fileCount)"
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
    param([string]$FolderPath, [string]$FolderName)
    foreach ($ext in $VideoExtensions) {
        if (Test-Path -LiteralPath (Join-Path $FolderPath ($FolderName + $ext)) -PathType Leaf) {
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

function Walk-Root {
    param([string]$Root, [bool]$IsVideo, [hashtable]$ByPath, [hashtable]$BySig)

    $rootLabel = if ($IsVideo) { "videoset" } else { "photoset" }
    Write-Host "  Walking $rootLabel root: $Root"

    if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
        Write-Warning "  Root does not exist: $Root"
        return [System.Collections.ArrayList]::new()
    }

    $delta      = [System.Collections.ArrayList]::new()
    $skippedCF  = 0  # channelFolders skipped entirely
    $skippedYr  = 0  # year dirs skipped
    $skippedLf  = 0  # leaves skipped (unchanged)
    $processed  = 0

    $channelFolders = Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue

    foreach ($cf in $channelFolders) {
        # Always use UTC for mtime comparisons — the server stores/returns UTC timestamps.
        # LastWriteTime is local time; LastWriteTimeUtc is always UTC regardless of timezone.
        $cfMtime = $cf.LastWriteTimeUtc

        # ── Level 1 skip: channelFolder mtime unchanged ─────────────────────
        # Look up any known leaf under this channelFolder to get its stored mtime
        $normCfPrefix = Normalize-Path $cf.FullName
        $storedCfMtime = $null
        foreach ($key in $ByPath.Keys) {
            if ($key.StartsWith($normCfPrefix + "\")) {
                $stored = $ByPath[$key]
                if ($stored.chanFolderModifiedAt) {
                    $storedCfMtime = To-UtcDateTime $stored.chanFolderModifiedAt
                    break
                }
            }
        }

        if (-not $SkipChanCache -and $storedCfMtime -ne $null -and [Math]::Abs(($cfMtime - $storedCfMtime).TotalSeconds) -lt 2) {
            if ($VerbosePreference -ne "SilentlyContinue") {
                Write-Host "    [SKIP] $($cf.Name) (channelFolder unchanged)"
            }
            $skippedCF++
            continue
        }

        $yearDirs = Get-ChildItem -LiteralPath $cf.FullName -Directory -ErrorAction SilentlyContinue

        foreach ($yf in $yearDirs) {
            $yrMtime = $yf.LastWriteTimeUtc

            # ── Level 2 skip: year dir mtime unchanged ──────────────────────
            $normYrPrefix = Normalize-Path $yf.FullName
            $storedYrMtime = $null
            foreach ($key in $ByPath.Keys) {
                if ($key.StartsWith($normYrPrefix + "\")) {
                    $stored = $ByPath[$key]
                    if ($stored.yearDirModifiedAt) {
                        $storedYrMtime = To-UtcDateTime $stored.yearDirModifiedAt
                        break
                    }
                }
            }

            if ($storedYrMtime -ne $null -and [Math]::Abs(($yrMtime - $storedYrMtime).TotalSeconds) -lt 2) {
                if ($VerbosePreference -ne "SilentlyContinue") {
                    Write-Host "      [SKIP] $($cf.Name)\$($yf.Name) (year unchanged)"
                }
                $skippedYr++
                continue
            }

            $leafDirs = Get-ChildItem -LiteralPath $yf.FullName -Directory -ErrorAction SilentlyContinue

            foreach ($lf in $leafDirs) {
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
                }

                # ── Level 3 skip: leaf mtime unchanged ──────────────────────
                if ($existing -and $existing.leafDirModifiedAt) {
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
                $videoPresent = if ($IsVideo) { Get-VideoPresent $lf.FullName $folderName } else { $null }

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
                if ($previousFullPath) {
                    $item | Add-Member -NotePropertyName previousFullPath -NotePropertyValue $previousFullPath
                }

                [void]$delta.Add($item)
            }
        }
    }

    Write-Host "    Processed: $processed folder(s) | Skipped channelFolders: $skippedCF | Skipped years: $skippedYr | Skipped leaves: $skippedLf"
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

    Write-Host "  Checking $linked folder(s) for missing _pulseboard.json..."
    $written  = 0
    $skipped  = 0
    $errors   = 0

    foreach ($ak in $ByArchKey.Keys) {
        $rec       = $ByArchKey[$ak]
        $folderPath = [string]$rec.fullPath
        $sidecarPath = Join-Path $folderPath "_pulseboard.json"

        # Skip if folder doesn't exist on this machine
        if (-not (Test-Path -LiteralPath $folderPath -PathType Container)) {
            continue
        }

        # Skip if sidecar already present
        if (Test-Path -LiteralPath $sidecarPath -PathType Leaf) {
            $skipped++
            continue
        }

        if ($DryRun) {
            Write-Host "  [DRY-RUN] Would write sidecar: $sidecarPath"
            $written++
            continue
        }

        # Fetch sidecar content from server
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

        # Write JSON to _pulseboard.json
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

    Write-Host ("  Sidecars written: $written | Already present: $skipped" + $(if ($errors -gt 0) { " | Errors: $errors" } else { "" }))
}

function Run-FullScan {
    Write-Host "Mode: Full (smart — with mtime skip + rename detection)"
    Write-Host ""

    # ── Step 1: Preload known folders ────────────────────────────────────────
    $byPath, $bySig, $byArchKey = Load-KnownFolders
    Write-Host ""

    # ── Step 2: Walk roots ───────────────────────────────────────────────────
    $allDelta = [System.Collections.ArrayList]::new()

    if ($PhotosetRoot) {
        $root = $PhotosetRoot.TrimEnd("/\")
        $found = Walk-Root -Root $root -IsVideo $false -ByPath $byPath -BySig $bySig
        foreach ($f in $found) { [void]$allDelta.Add($f) }
    }

    if ($VideosetRoot) {
        $root = $VideosetRoot.TrimEnd("/\")
        $found = Walk-Root -Root $root -IsVideo $true -ByPath $byPath -BySig $bySig
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

    if ($totalDelta -eq 0) {
        Write-Host ""
        Write-Host "Nothing changed since last scan."
        exit 0
    }

    if ($DryRun) {
        Write-Host ""
        Write-Host "Dry-run: would send $totalDelta item(s) in batches of $BatchSize"
        $preview = [System.Collections.ArrayList]::new()
        for ($i = 0; $i -lt [Math]::Min(3, $totalDelta); $i++) {
            [void]$preview.Add($allDelta[$i])
        }
        Write-Host "First items preview:"
        ConvertTo-Json -InputObject @($preview) -Depth 6 | Write-Host
        return
    }

    # ── Step 3: POST delta in batches ────────────────────────────────────────
    Write-Host ""
    Write-Host "Sending delta in batches of $BatchSize..."

    $sent       = 0
    $totalSent  = 0
    $batchNum   = 0
    $totCre     = 0; $totUpd = 0; $totRen = 0; $totUnch = 0

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
            $pct = [Math]::Round(($end / $totalDelta) * 100)
            Write-Host "  Batch $batchNum`: sent $($batch.Count) — $pct% complete"
        } catch {
            Write-Error "Batch $batchNum failed: $_"; exit 1
        }

        $sent += $end - $sent
        $totalSent += $batch.Count
    }

    Write-Host ""
    Write-Host "── Summary ────────────────────────────────────"
    Write-Host ("  New:              " + $totCre)
    Write-Host ("  Updated:          " + $totUpd)
    Write-Host ("  Renamed:          " + $totRen)
    Write-Host ("  Unchanged (mtime):" + $totUnch)
    if ($creates -gt 0) {
        Write-Host "  Matching pass:    running in background on server"
    }
    Write-Host "────────────────────────────────────────────────"

    # ── Step 4: Write sidecar files ─────────────────────────────────────────
    # Count how many on-disk folders are missing _pulseboard.json.
    # Sidecars are written to ALL folders (linked or not) — every ArchiveFolder
    # now has a stable archiveKey from the moment it is first scanned.
    $needsSidecar = 0
    foreach ($ak in $byArchKey.Keys) {
        $folderPath  = [string]$byArchKey[$ak].fullPath
        $sidecarPath = Join-Path $folderPath "_pulseboard.json"
        if ((Test-Path -LiteralPath $folderPath -PathType Container) -and
            -not (Test-Path -LiteralPath $sidecarPath -PathType Leaf)) {
            $needsSidecar++
        }
    }

    if ($needsSidecar -gt 0) {
        Write-Host ""
        if ($NoSidecarPrompt -or $DryRun) {
            # Non-interactive or dry-run: proceed without asking
            $doWrite = $true
        } else {
            $answer  = Read-Host "Write _pulseboard.json into $needsSidecar folder(s) missing a sidecar? [Y/n]"
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
