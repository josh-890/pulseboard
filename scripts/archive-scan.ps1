<#
.SYNOPSIS
    Scans local archive folders and reports their status back to Pulseboard.

.DESCRIPTION
    Two scan modes:

    Targeted (default):
        Fetches all recorded archive paths from the Pulseboard app, checks each
        folder on the local filesystem, and POSTs the results to the ingest API.
        The app updates each set's archive status (OK, MISSING, CHANGED, INCOMPLETE)
        based on the results.

    Full:
        Walks the entire archive filesystem (photoset root and/or videoset root),
        discovering every leaf folder regardless of whether it is already in the
        database. Sends discovered folder metadata in batches to the full-ingest API.
        The app upserts ArchiveFolder records and runs a matching pass to link
        discovered folders to existing DB records.

    In both modes the script never reads roots or constructs paths itself — Targeted
    mode receives full filesystem paths from the app; Full mode uses the root paths
    you supply via -PhotosetRoot and -VideosetRoot (or environment variables).

    Authentication uses a shared API key sent as the x-archive-key header.
    Set ARCHIVE_API_KEY in the app's .env (on the server) and pass the same
    value here via -ApiKey or the ARCHIVE_API_KEY environment variable.

.PARAMETER BaseUrl
    Base URL of the Pulseboard app.
    Default: value of ARCHIVE_BASE_URL environment variable, or http://localhost:3000

.PARAMETER ApiKey
    API key for authenticating with the archive endpoints.
    Default: value of ARCHIVE_API_KEY environment variable.
    Required if the environment variable is not set.

.PARAMETER Tenant
    Tenant ID to scan (e.g. "pulse" or "xpulse").
    Sent as the x-tenant-id header so the app queries the correct database.
    Default: value of ARCHIVE_TENANT environment variable.
    If omitted, the app uses its default tenant (first in TENANT_REGISTRY).

.PARAMETER Mode
    Scan mode: Targeted (default) or Full.
    Targeted: check only paths already recorded in the database.
    Full:     walk the entire archive filesystem and discover all folders.

.PARAMETER PhotosetRoot
    Root folder for photosets used in Full mode (e.g. "X:\Sites\").
    Default: value of ARCHIVE_PHOTOSET_ROOT environment variable.
    Required in Full mode if -VideosetRoot is not provided.

.PARAMETER VideosetRoot
    Root folder for videosets used in Full mode (e.g. "M:\VSites\").
    Default: value of ARCHIVE_VIDEOSET_ROOT environment variable.
    Required in Full mode if -PhotosetRoot is not provided.

.PARAMETER BatchSize
    Number of folders to send per POST request in Full mode. Default: 200.

.PARAMETER DryRun
    If specified, prints what would be sent without POSTing results to the app.
    The filesystem is still checked; only the ingest step is skipped.

.PARAMETER Verbose
    If specified, prints the status of every path as it is checked (Targeted mode)
    or every folder discovered (Full mode).

.EXAMPLE
    .\archive-scan.ps1 -BaseUrl http://10.66.20.65:3000 -ApiKey s3cr3t -Tenant pulse

    Targeted scan of the "pulse" tenant.

.EXAMPLE
    .\archive-scan.ps1 -BaseUrl http://10.66.20.65:3000 -ApiKey s3cr3t -Tenant xpulse `
        -Mode Full -PhotosetRoot "X:\Sites\" -VideosetRoot "M:\VSites\"

    Full filesystem walk of both roots for the "xpulse" tenant.

.EXAMPLE
    .\archive-scan.ps1 -BaseUrl http://10.66.20.65:3000 -ApiKey s3cr3t -Tenant pulse `
        -Mode Full -PhotosetRoot "X:\Sites\" -DryRun

    Full walk dry-run — print discovered folders without sending to the app.

.EXAMPLE
    $env:ARCHIVE_BASE_URL     = "http://10.66.20.65:3000"
    $env:ARCHIVE_API_KEY      = "s3cr3t"
    $env:ARCHIVE_TENANT       = "pulse"
    $env:ARCHIVE_PHOTOSET_ROOT = "X:\Sites\"
    $env:ARCHIVE_VIDEOSET_ROOT = "M:\VSites\"
    .\archive-scan.ps1 -Mode Full

    Full walk using environment variables so credentials stay out of shell history.

.NOTES
    Requires PowerShell 5.1 or later (built into Windows 10/11).
    No external dependencies — uses only built-in cmdlets.

    Targeted mode — video extensions checked: .mp4, .wmv, .mkv, .avi, .mov
    For videosets the script checks:
      - Folder exists
      - frames\ subfolder file count
      - Presence of {folderName}.{ext} in the folder root
    For photosets the script checks:
      - Folder exists
      - Count of files directly in the folder root (non-recursive)

    Full mode — folder name convention parsed:
      {YYYY-MM-DD}-{ShortName} {Participant} - {Title}
    Folders that don't match the convention are still recorded as orphans
    (parsedDate/parsedShortName/parsedTitle will be null).

    Full mode walks exactly 3 levels deep:
      {root}\{channelFolder}\{year}\{folderName}\
    Folders at other depths are ignored.
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
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# ── Validation ────────────────────────────────────────────────────────────────

if (-not $ApiKey) {
    Write-Error "API key is required. Pass -ApiKey or set the ARCHIVE_API_KEY environment variable."
    exit 1
}

if ($Mode -eq 'Full' -and -not $PhotosetRoot -and -not $VideosetRoot) {
    Write-Error "Full mode requires at least one of -PhotosetRoot or -VideosetRoot."
    exit 1
}

$BaseUrl = $BaseUrl.TrimEnd("/")

# ── Build request headers ─────────────────────────────────────────────────────

$headers = @{ "x-archive-key" = $ApiKey }
if ($Tenant) {
    $headers["x-tenant-id"] = $Tenant
}

# ── Shared helpers ────────────────────────────────────────────────────────────

$VideoExtensions = @(".mp4", ".wmv", ".mkv", ".avi", ".mov")

function Get-StatusLabel {
    param($Result)
    if ($Result.error)                      { return "ERROR" }
    if (-not $Result.exists)                { return "MISSING" }
    if ($Result.videoPresent -eq $false)    { return "INCOMPLETE" }
    return "OK"
}

# ── Targeted mode ─────────────────────────────────────────────────────────────

function Check-ArchivePath {
    param(
        [string]$Id,
        [string]$Type,
        [string]$ArchivePath,
        [bool]$IsVideo,
        [string]$FolderName
    )

    $exists       = $false
    $fileCount    = $null
    $videoPresent = $null
    $errorMsg     = $null

    try {
        if (-not (Test-Path -LiteralPath $ArchivePath -PathType Container)) {
            # Folder does not exist — leave defaults
        } else {
            $exists = $true

            if ($IsVideo) {
                $framesDir = Join-Path $ArchivePath "frames"
                if (Test-Path -LiteralPath $framesDir -PathType Container) {
                    $fileCount = (Get-ChildItem -LiteralPath $framesDir -File).Count
                } else {
                    $fileCount = 0
                }

                $videoFound = $false
                foreach ($ext in $VideoExtensions) {
                    $candidate = Join-Path $ArchivePath ($FolderName + $ext)
                    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                        $videoFound = $true
                        break
                    }
                }
                $videoPresent = $videoFound

            } else {
                $fileCount = (Get-ChildItem -LiteralPath $ArchivePath -File).Count
            }
        }
    } catch {
        $exists    = $false
        $fileCount = $null
        $errorMsg  = $_.Exception.Message
    }

    return [PSCustomObject]@{
        id           = $Id
        type         = $Type
        path         = $ArchivePath
        exists       = $exists
        fileCount    = $fileCount
        videoPresent = $videoPresent
        error        = $errorMsg
    }
}

function Run-TargetedScan {
    Write-Host "Mode: Targeted"
    Write-Host ""
    Write-Host "Fetching known archive paths..."
    try {
        $entries = @(Invoke-RestMethod `
            -Uri "$BaseUrl/api/archive/paths" `
            -Headers $headers `
            -Method Get)
    } catch {
        Write-Error "Failed to fetch paths: $_"
        exit 1
    }

    $total = $entries.Count
    Write-Host "  Found $total path(s) to check"

    if ($total -eq 0) {
        Write-Host "Nothing to scan."
        exit 0
    }

    # PS 5.1: Invoke-RestMethod can return Hashtable for single-element arrays
    $entries = $entries | ForEach-Object {
        if ($_ -is [System.Collections.Hashtable]) { [PSCustomObject]$_ } else { $_ }
    }

    $results = [System.Collections.ArrayList]::new()
    $counts  = @{ ok = 0; incomplete = 0; missing = 0; error = 0 }

    foreach ($entry in $entries) {
        $result = Check-ArchivePath `
            -Id          ([string]$entry.id) `
            -Type        ([string]$entry.type) `
            -ArchivePath ([string]$entry.path) `
            -IsVideo     ([bool]$entry.isVideo) `
            -FolderName  ([string]$entry.folderName)

        [void]$results.Add($result)

        $label = Get-StatusLabel $result

        if ($VerbosePreference -ne "SilentlyContinue") {
            Write-Host "  [$label] $($entry.path)"
            if ($entry.isVideo) {
                $exts = $VideoExtensions -join ", "
                Write-Host "          video file expected: $($entry.folderName).{$exts}"
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
        Write-Host ""
        Write-Host "Dry-run: would send the following results:"
        ConvertTo-Json -InputObject @($results) -Depth 5 | Write-Host
    } else {
        Write-Host ""
        Write-Host "Sending scan results..."
        try {
            $body     = ConvertTo-Json -InputObject @($results) -Depth 5
            $response = Invoke-RestMethod `
                -Uri         "$BaseUrl/api/archive/ingest" `
                -Headers     $headers `
                -Method      Post `
                -Body        $body `
                -ContentType "application/json"
            Write-Host "  Ingested $($response.count) result(s)"
        } catch {
            Write-Error "Failed to ingest results: $_"
            exit 1
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

# ── Full walk mode ────────────────────────────────────────────────────────────

function Parse-FolderName {
    param([string]$Name)
    # Convention: YYYY-MM-DD-ShortName Participant - Title
    # Examples:
    #   "2012-08-08-FJ Jane Doe - Summer Meadow"
    #   "2015-03-21-MA Jane - Waterfall"  (no middle name)
    if ($Name -match '^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9]+)\s+(.+?)\s+-\s+(.+)$') {
        return [PSCustomObject]@{
            parsedDate      = $Matches[1]           # "YYYY-MM-DD"
            parsedShortName = $Matches[2]           # e.g. "FJ"
            parsedTitle     = $Matches[4]           # e.g. "Summer Meadow"
        }
    }
    return $null
}

function Check-FullFolder {
    param(
        [string]$FolderPath,
        [bool]$IsVideo
    )

    $fileCount    = $null
    $videoPresent = $null
    $folderName   = Split-Path $FolderPath -Leaf

    try {
        if ($IsVideo) {
            $framesDir = Join-Path $FolderPath "frames"
            if (Test-Path -LiteralPath $framesDir -PathType Container) {
                $fileCount = (Get-ChildItem -LiteralPath $framesDir -File).Count
            } else {
                $fileCount = 0
            }

            $videoFound = $false
            foreach ($ext in $VideoExtensions) {
                $candidate = Join-Path $FolderPath ($folderName + $ext)
                if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                    $videoFound = $true
                    break
                }
            }
            $videoPresent = $videoFound
        } else {
            $fileCount = (Get-ChildItem -LiteralPath $FolderPath -File).Count
        }
    } catch {
        $fileCount    = $null
        $videoPresent = $null
    }

    $parsed = Parse-FolderName $folderName

    return [PSCustomObject]@{
        fullPath        = $FolderPath
        isVideo         = $IsVideo
        fileCount       = $fileCount
        videoPresent    = $videoPresent
        folderName      = $folderName
        parsedDate      = if ($parsed) { $parsed.parsedDate      } else { $null }
        parsedShortName = if ($parsed) { $parsed.parsedShortName } else { $null }
        parsedTitle     = if ($parsed) { $parsed.parsedTitle     } else { $null }
    }
}

function Walk-ArchiveRoot {
    param(
        [string]$Root,
        [bool]$IsVideo
    )

    $rootLabel = if ($IsVideo) { "videoset" } else { "photoset" }
    Write-Host "  Walking $rootLabel root: $Root"

    if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
        Write-Warning "  Root does not exist: $Root"
        return [System.Collections.ArrayList]::new()
    }

    $folders = [System.Collections.ArrayList]::new()

    # Walk exactly 3 levels: root → channelFolder → year → folderName
    $channelFolders = Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue
    foreach ($cf in $channelFolders) {
        $yearFolders = Get-ChildItem -LiteralPath $cf.FullName -Directory -ErrorAction SilentlyContinue
        foreach ($yf in $yearFolders) {
            $leafFolders = Get-ChildItem -LiteralPath $yf.FullName -Directory -ErrorAction SilentlyContinue
            foreach ($lf in $leafFolders) {
                $item = Check-FullFolder -FolderPath $lf.FullName -IsVideo $IsVideo
                [void]$folders.Add($item)

                if ($VerbosePreference -ne "SilentlyContinue") {
                    $parsedTag = if ($item.parsedDate) { "[$($item.parsedDate) · $($item.parsedShortName)]" } else { "[unparsed]" }
                    $vcTag = if ($IsVideo) { "video:$(if ($item.videoPresent) {'ok'} else {'missing'}) frames:$($item.fileCount)" } else { "files:$($item.fileCount)" }
                    Write-Host "    $parsedTag $($lf.Name) — $vcTag"
                }
            }
        }
    }

    Write-Host "    Discovered $($folders.Count) folder(s)"
    return $folders
}

function Send-Batch {
    param(
        [System.Collections.ArrayList]$Batch
    )
    $body     = ConvertTo-Json -InputObject @($Batch) -Depth 5
    $response = Invoke-RestMethod `
        -Uri         "$BaseUrl/api/archive/full-ingest" `
        -Headers     $headers `
        -Method      Post `
        -Body        $body `
        -ContentType "application/json"
    return $response.upserted
}

function Run-FullScan {
    Write-Host "Mode: Full"
    Write-Host ""

    $allFolders = [System.Collections.ArrayList]::new()

    if ($PhotosetRoot) {
        $root = $PhotosetRoot.TrimEnd("/\")
        $found = Walk-ArchiveRoot -Root $root -IsVideo $false
        foreach ($f in $found) { [void]$allFolders.Add($f) }
    }

    if ($VideosetRoot) {
        $root = $VideosetRoot.TrimEnd("/\")
        $found = Walk-ArchiveRoot -Root $root -IsVideo $true
        foreach ($f in $found) { [void]$allFolders.Add($f) }
    }

    $total = $allFolders.Count
    Write-Host ""
    Write-Host "Total folders discovered: $total"

    if ($total -eq 0) {
        Write-Host "Nothing found."
        exit 0
    }

    if ($DryRun) {
        Write-Host ""
        Write-Host "Dry-run: would send $total folder(s) in batches of $BatchSize"
        $firstBatch = [System.Collections.ArrayList]::new()
        for ($i = 0; $i -lt [Math]::Min(5, $total); $i++) {
            [void]$firstBatch.Add($allFolders[$i])
        }
        Write-Host "First batch preview:"
        ConvertTo-Json -InputObject @($firstBatch) -Depth 5 | Write-Host
    } else {
        Write-Host ""
        Write-Host "Sending $total folder(s) in batches of $BatchSize..."

        $sent      = 0
        $upserted  = 0
        $batchNum  = 0

        while ($sent -lt $total) {
            $batchNum++
            $end   = [Math]::Min($sent + $BatchSize, $total)
            $batch = [System.Collections.ArrayList]::new()

            for ($i = $sent; $i -lt $end; $i++) {
                [void]$batch.Add($allFolders[$i])
            }

            try {
                $count = Send-Batch -Batch $batch
                $upserted += $count
                $pct = [Math]::Round(($end / $total) * 100)
                Write-Host "  Batch $batchNum`: sent $($batch.Count) — upserted $count — progress $pct%"
            } catch {
                Write-Error "Batch $batchNum failed: $_"
                exit 1
            }

            $sent = $end
        }

        Write-Host ""
        Write-Host "── Summary ────────────────────────────────────"
        Write-Host ("  Folders discovered: " + $total)
        Write-Host ("  Upserted in DB:     " + $upserted)
        Write-Host "  Matching pass:       running in background on server"
        Write-Host "────────────────────────────────────────────────"
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
