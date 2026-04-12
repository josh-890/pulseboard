<#
.SYNOPSIS
    Scans local archive folders and reports their status back to Pulseboard.

.DESCRIPTION
    Fetches all recorded archive paths from the Pulseboard app, checks each
    folder on the local filesystem, and POSTs the results to the ingest API.
    The app updates each set's archive status (OK, MISSING, CHANGED, INCOMPLETE)
    based on the results.

    The script never reads roots or constructs paths itself — the app returns
    full filesystem paths (e.g. X:\Sites\FJ-Femjoy\2012\...) reconstructed
    from the relative paths stored in the database and the roots configured
    in Settings.

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

.PARAMETER DryRun
    If specified, prints what would be sent without POSTing results to the app.
    The filesystem is still checked; only the ingest step is skipped.

.PARAMETER Verbose
    If specified, prints the status of every path as it is checked.

.EXAMPLE
    .\archive-scan.ps1 -BaseUrl http://10.66.20.65:3000 -ApiKey s3cr3t -Tenant pulse

    Scan the "pulse" tenant.

.EXAMPLE
    .\archive-scan.ps1 -BaseUrl http://10.66.20.65:3000 -ApiKey s3cr3t -Tenant xpulse

    Scan the "xpulse" tenant.

.EXAMPLE
    .\archive-scan.ps1 -BaseUrl http://10.66.20.65:3000 -ApiKey s3cr3t -Tenant pulse -Verbose

    Scan with per-path status output.

.EXAMPLE
    .\archive-scan.ps1 -BaseUrl http://10.66.20.65:3000 -ApiKey s3cr3t -Tenant pulse -DryRun

    Check the filesystem and print what would be sent, without writing anything.

.EXAMPLE
    $env:ARCHIVE_BASE_URL = "http://10.66.20.65:3000"
    $env:ARCHIVE_API_KEY  = "s3cr3t"
    $env:ARCHIVE_TENANT   = "pulse"
    .\archive-scan.ps1

    Use environment variables so credentials are not visible in shell history.

.NOTES
    Requires PowerShell 5.1 or later (built into Windows 10/11).
    No external dependencies — uses only built-in cmdlets.

    Video extensions checked: .mp4, .wmv, .mkv, .avi, .mov
    For videosets the script checks:
      - Folder exists
      - frames\ subfolder file count
      - Presence of {folderName}.{ext} in the folder root

    For photosets the script checks:
      - Folder exists
      - Count of files directly in the folder root (non-recursive)
#>

[CmdletBinding()]
param(
    [string]$BaseUrl = ($env:ARCHIVE_BASE_URL ?? "http://localhost:3000"),
    [string]$ApiKey  = ($env:ARCHIVE_API_KEY  ?? ""),
    [string]$Tenant  = ($env:ARCHIVE_TENANT   ?? ""),
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# ── Validation ────────────────────────────────────────────────────────────────

if (-not $ApiKey) {
    Write-Error "API key is required. Pass -ApiKey or set the ARCHIVE_API_KEY environment variable."
    exit 1
}

$BaseUrl = $BaseUrl.TrimEnd("/")

# ── Build request headers ─────────────────────────────────────────────────────

$headers = @{ "x-archive-key" = $ApiKey }
if ($Tenant) {
    $headers["x-tenant-id"] = $Tenant
}

# ── Helpers ───────────────────────────────────────────────────────────────────

$VideoExtensions = @(".mp4", ".wmv", ".mkv", ".avi", ".mov")

function Check-ArchivePath {
    param(
        [string]$Id,
        [string]$Type,
        [string]$ArchivePath,
        [bool]$IsVideo,
        [string]$FolderName
    )

    # Use PSCustomObject (not hashtable) so ConvertTo-Json serialises correctly in PS 5.1
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
                # Count frames\ subfolder
                $framesDir = Join-Path $ArchivePath "frames"
                if (Test-Path -LiteralPath $framesDir -PathType Container) {
                    $fileCount = (Get-ChildItem -LiteralPath $framesDir -File).Count
                } else {
                    $fileCount = 0
                }

                # Check for video file: {folderName}.{ext}
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
                # Count files directly in the folder (non-recursive)
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

function Get-StatusLabel {
    param($Result)
    if ($Result.error)                      { return "ERROR" }
    if (-not $Result.exists)                { return "MISSING" }
    if ($Result.videoPresent -eq $false)    { return "INCOMPLETE" }
    return "OK"
}

# ── Main ──────────────────────────────────────────────────────────────────────

Write-Host "Archive scan — base URL: $BaseUrl"
if ($Tenant) { Write-Host "Tenant: $Tenant" }
if ($DryRun) { Write-Host "(dry-run mode — no changes will be written)" }

# 1. Fetch known paths
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

# Normalise: Invoke-RestMethod on PS 5.1 can return a Hashtable instead of
# PSCustomObject for single-element arrays. Convert everything to PSCustomObject.
$entries = $entries | ForEach-Object {
    if ($_ -is [System.Collections.Hashtable]) {
        [PSCustomObject]$_
    } else {
        $_
    }
}

# 2. Check each path on the local filesystem
# Use ArrayList to avoid PS 5.1 array-coercion issues with +=
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

# 3. POST results (or print in dry-run)
if ($DryRun) {
    Write-Host ""
    Write-Host "Dry-run: would send the following results:"
    ConvertTo-Json -InputObject @($results) -Depth 5 | Write-Host
} else {
    Write-Host ""
    Write-Host "Sending scan results..."
    try {
        # @($results) ensures a JSON array even when there is only one result
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

# 4. Summary
Write-Host ""
Write-Host "── Summary ────────────────────────────────────"
Write-Host ("  OK:         " + $counts.ok)
if ($counts.incomplete -gt 0) { Write-Host ("  Incomplete: " + $counts.incomplete) }
if ($counts.missing    -gt 0) { Write-Host ("  Missing:    " + $counts.missing)    }
if ($counts.error      -gt 0) { Write-Host ("  Errors:     " + $counts.error)      }
Write-Host "────────────────────────────────────────────────"
