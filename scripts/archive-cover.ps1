<#
.SYNOPSIS
    Uploads a cover thumbnail for every archive folder (implementation plan slice 1).

.DESCRIPTION
    The archive workspace is a text-only tree, which makes judging tens of thousands of
    orphan folders guesswork. This agent runs on the machine that holds the archive (same
    place as archive-scan.ps1), picks one image per folder, downscales it LOCALLY, and POSTs
    only the small thumbnail. The multi-MB originals never leave the machine — same pattern
    as the HD re-bake agent (ADR-0017).

    Cover selection, in order:
      1. a file matching *-c.jpg  — if present, that IS the cover
      2. otherwise the first image by name
    For videosets the same rule is applied to the frames\ subfolder.

    Robustness is the point of this script, not a nicety. A corrupt image must fail exactly
    ONE folder, must say WHICH one, and must not force a full redo afterwards:
      - every folder runs in its own try/catch
      - the path is printed BEFORE the decode, because a native GDI+ hang throws nothing and
        the last printed line is then the only evidence
      - failures are POSTed to the app and stored on the folder, so they are individually
        visible and fixable in the workspace
      - the worklist only returns folders with no cover, so a re-run resumes

.PARAMETER Path
    Restrict to a subtree (matches archive-scan.ps1 -Path).

.PARAMETER RetryFailed
    Also revisit folders that previously failed. Off by default so a routine run does not
    grind through known-bad images every time.

.PARAMETER Limit
    Process at most N folders this run. Useful for a first cautious pass.

.PARAMETER DryRun
    Pick and downscale, but do not POST.

.EXAMPLE
    .\archive-cover.ps1 -BaseUrl http://10.66.20.65:3000 -Tenant xpulse -Limit 50 -DryRun

.NOTES
    Requires Windows PowerShell 5.1+ (System.Drawing / GDI+). No external deps.
#>

[CmdletBinding()]
param(
    [string]$BaseUrl = ($env:ARCHIVE_BASE_URL ?? "http://localhost:3000"),
    [string]$ApiKey  = ($env:ARCHIVE_API_KEY  ?? ""),
    [string]$Tenant  = ($env:ARCHIVE_TENANT   ?? ""),
    [string]$Path    = "",
    [switch]$RetryFailed,
    [int]$Limit      = 0,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# ── .env loader (mirrors archive-scan.ps1) ────────────────────────────────────
$dotEnvPath = Join-Path $PSScriptRoot ".env"
if (Test-Path -LiteralPath $dotEnvPath -PathType Leaf) {
    $dotEnv = @{}
    Get-Content $dotEnvPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
            $dotEnv[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    if (-not $ApiKey -and $dotEnv["ARCHIVE_API_KEY"]) { $ApiKey = $dotEnv["ARCHIVE_API_KEY"] }
    if ($BaseUrl -eq "http://localhost:3000" -and $dotEnv["ARCHIVE_BASE_URL"]) { $BaseUrl = $dotEnv["ARCHIVE_BASE_URL"] }
    if (-not $Tenant -and $dotEnv["ARCHIVE_TENANT"]) { $Tenant = $dotEnv["ARCHIVE_TENANT"] }
}

if (-not $ApiKey) {
    Write-Error "API key is required. Pass -ApiKey, set ARCHIVE_API_KEY, or add it to a .env file next to the script."
    exit 1
}

$BaseUrl = $BaseUrl.TrimEnd("/")
$headers = @{ "x-archive-key" = $ApiKey }
if ($Tenant) { $headers["x-tenant-id"] = $Tenant }

$THUMB_MAX_PX  = 512
$IMAGE_PATTERN = '\.(jpe?g|png|webp|bmp)$'

# ── Cover selection ───────────────────────────────────────────────────────────

# `*-c.jpg` wins outright; otherwise the first image by name. Videosets carry
# their stills in frames\, so look there when the folder root has none.
function Select-CoverFile {
    param([string]$FolderPath, [bool]$IsVideo)

    $searchDirs = @($FolderPath)
    $framesDir = Join-Path $FolderPath "frames"
    if ($IsVideo -and (Test-Path -LiteralPath $framesDir -PathType Container)) {
        $searchDirs = @($framesDir, $FolderPath)
    }

    foreach ($dir in $searchDirs) {
        $files = @(Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue |
                   Where-Object { $_.Name -match $IMAGE_PATTERN })
        if ($files.Count -eq 0) { continue }

        $designated = @($files | Where-Object { $_.Name -match '-c\.jpe?g$' } | Sort-Object Name)
        if ($designated.Count -gt 0) { return $designated[0].FullName }

        return ($files | Sort-Object Name)[0].FullName
    }
    return $null
}

# Downscale to a JPEG thumbnail. GDI+ decodes lazily, so a corrupt file first
# blows up HERE rather than at Image::FromFile — which is exactly why every call
# site wraps this in its own try/catch.
function New-Thumbnail {
    param([string]$ImagePath, [int]$MaxPx)

    $img = [System.Drawing.Image]::FromFile($ImagePath)
    try {
        $scale = [Math]::Min(1.0, [Math]::Min([double]$MaxPx / $img.Width, [double]$MaxPx / $img.Height))
        $w = [int][Math]::Max(1.0, [Math]::Round($img.Width * $scale))
        $h = [int][Math]::Max(1.0, [Math]::Round($img.Height * $scale))

        $bmp = New-Object System.Drawing.Bitmap($w, $h)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.Clear([System.Drawing.Color]::White)
            $destRect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
            $g.DrawImage($img, $destRect, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel)

            $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
                     Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
            $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
            $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]82)
            $ms = New-Object System.IO.MemoryStream
            $bmp.Save($ms, $codec, $ep)
            return $ms.ToArray()
        } finally {
            $g.Dispose(); $bmp.Dispose()
        }
    } finally {
        $img.Dispose()
    }
}

function Send-CoverError {
    param([string]$ArchiveKey, [string]$Message)
    # Best-effort: never let the reporting of a failure become a second failure.
    try {
        $body = ConvertTo-Json @{ error = $Message } -Compress
        Invoke-RestMethod -Uri "$BaseUrl/api/archive/cover/$ArchiveKey" `
            -Headers $headers -Method Post -Body $body -ContentType 'application/json' | Out-Null
    } catch {
        Write-Warning "  (could not report the failure to the app: $_)"
    }
}

# ── Main ──────────────────────────────────────────────────────────────────────

Write-Host "Archive covers -> $BaseUrl$(if ($DryRun) { '  [dry-run]' })$(if ($RetryFailed) { '  [retry-failed]' })"
if ($Tenant) { Write-Host "Tenant: $Tenant" }
if ($Path)   { Write-Host "Scope:  $Path" }

$qs = @()
if ($Limit -gt 0)  { $qs += "limit=$Limit" }
if ($RetryFailed)  { $qs += "retryFailed=1" }
if ($Path)         { $qs += "path=$([uri]::EscapeDataString($Path))" }
$wlUrl = "$BaseUrl/api/archive/cover-worklist"
if ($qs.Count -gt 0) { $wlUrl += "?" + ($qs -join "&") }

try {
    $wl = Invoke-RestMethod -Uri $wlUrl -Headers $headers -Method Get
} catch {
    Write-Error "Failed to fetch the cover worklist: $_"; exit 1
}

$entries = @($wl.entries)
Write-Host ("Folders needing a cover: {0}   (archive: {1} total, {2} with cover, {3} failed)" -f `
    $wl.count, $wl.stats.total, $wl.stats.withCover, $wl.stats.failed)
Write-Host ""

$t = @{ uploaded = 0; noImage = 0; failed = 0; skipped = 0 }
$idx = 0

foreach ($e in $entries) {
    $idx++
    $folder = [string]$e.fullPath
    # Printed BEFORE the decode: a native GDI+ hang produces no exception, so this
    # line is the only record of which folder wedged the run.
    Write-Host ("[{0}/{1}] {2}" -f $idx, $entries.Count, $folder)

    try {
        if (-not (Test-Path -LiteralPath $folder -PathType Container)) {
            $t.skipped++
            Write-Warning "         folder is not on disk — skipping (run a scan to refresh)"
            continue
        }

        $coverFile = Select-CoverFile -FolderPath $folder -IsVideo ([bool]$e.isVideo)
        if (-not $coverFile) {
            $t.noImage++
            Write-Warning "         no image found in this folder"
            Send-CoverError -ArchiveKey $e.archiveKey -Message "No image file found in the folder"
            continue
        }

        $bytes = New-Thumbnail -ImagePath $coverFile -MaxPx $THUMB_MAX_PX

        if ($DryRun) {
            Write-Host ("         would upload {0} ({1:n0} KB thumbnail)" -f (Split-Path $coverFile -Leaf), ($bytes.Length / 1KB))
            continue
        }

        $tmp = [System.IO.Path]::Combine($env:TEMP, ([Guid]::NewGuid().ToString() + ".jpg"))
        try {
            # -InFile, not -Body: Invoke-RestMethod corrupts raw byte-array bodies.
            [System.IO.File]::WriteAllBytes($tmp, $bytes)
            Invoke-RestMethod -Uri "$BaseUrl/api/archive/cover/$($e.archiveKey)" `
                -Headers $headers -Method Post -InFile $tmp -ContentType 'image/jpeg' | Out-Null
            $t.uploaded++
            Write-Host ("         OK  {0}" -f (Split-Path $coverFile -Leaf))
        } finally {
            Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
        }
    } catch {
        # One bad folder costs one folder. Record it so it is visible in the app,
        # then carry on.
        $t.failed++
        $msg = $_.Exception.Message
        Write-Warning "         FAILED: $msg"
        if (-not $DryRun) { Send-CoverError -ArchiveKey $e.archiveKey -Message $msg }
    }
}

Write-Host ""
Write-Host "-- Summary ------------------------------------"
Write-Host "  Uploaded:      $($t.uploaded)"
Write-Host "  No image:      $($t.noImage)"
Write-Host "  Not on disk:   $($t.skipped)"
Write-Host "  Failed:        $($t.failed)"
if ($t.failed -gt 0 -or $t.noImage -gt 0) {
    Write-Host ""
    Write-Host "  Failures are recorded per folder — filter the archive workspace by"
    Write-Host "  'cover failed' to see and fix them individually. Re-run with"
    Write-Host "  -RetryFailed once the underlying files are repaired."
}
Write-Host "-----------------------------------------------"
