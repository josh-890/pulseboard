<#
.SYNOPSIS
    Upload person portraits from the person catalogue to Pulseboard.

.DESCRIPTION
    Walks <CatalogueRoot>\<Initial>\<Common_Name_(ICG-ID)>\, finds the portrait in
    each person folder, downscales it locally and POSTs it to the app keyed on the
    ICG-ID.

    WHY this exists. The attribution workbench asks "is this folder this person",
    and answering that from a name is guesswork — every comparable tool
    (Lightroom, digiKam, Immich, Google Photos) puts a reference face beside the
    candidate image. The app can only do that for identities it already knows: of
    5,074 suggested persons on xpulse, 94 are curated Persons and 711 are
    Contacts. The remaining 4,269 have no record at all, and they are exactly the
    ones the operator has nothing to go on. The catalogue has a portrait for
    almost every person, so this closes the gap.

    Only the downscaled portrait leaves this machine, never the catalogue itself —
    the same principle as ADR-0017's re-bake agent and ADR-0027's join.

    ROBUSTNESS, non-negotiable — this project has twice had a long run die on one
    bad image:
      * every person is processed inside its own try/catch; one bad file fails ONE
        person
      * the path is printed BEFORE the decode, so a native GDI+ hang names its file
      * the failure is REPORTED to the app and stored, not merely logged, so it is
        individually findable and retryable afterwards
      * decoding is never loosened to make a corrupt file pass; clean or re-encode
        the source instead

    Requires PowerShell 7+ on Windows: 7 for the `??` operator used below,
    Windows for System.Drawing / GDI+. No external deps. Run it from a pwsh
    prompt — double-clicking a .ps1 opens it in an editor, it does not run it.

.EXAMPLE
    .\catalogue-avatar.ps1 -CatalogueRoot "H:\Models\thenude"
    .\catalogue-avatar.ps1 -CatalogueRoot "H:\Models\thenude" -RetryFailed
    .\catalogue-avatar.ps1 -CatalogueRoot "H:\Models\thenude" -Limit 50 -DryRun
#>
param(
    [string]$CatalogueRoot = ($env:PERSON_CATALOGUE_ROOT ?? ""),
    [string]$BaseUrl = ($env:ARCHIVE_BASE_URL ?? "http://localhost:3000"),
    [string]$ApiKey  = ($env:ARCHIVE_API_KEY  ?? ""),
    [string]$Tenant  = ($env:ARCHIVE_TENANT   ?? ""),
    [switch]$Force,
    [switch]$RetryFailed,
    [int]$Limit      = 0,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# ── .env loader (mirrors archive-cover.ps1) ───────────────────────────────────
$dotEnvPath = Join-Path $PSScriptRoot ".env"
if (Test-Path -LiteralPath $dotEnvPath -PathType Leaf) {
    $dotEnv = @{}
    Get-Content $dotEnvPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
            $dotEnv[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    if (-not $ApiKey  -and $dotEnv["ARCHIVE_API_KEY"])  { $ApiKey  = $dotEnv["ARCHIVE_API_KEY"] }
    if (-not $Tenant  -and $dotEnv["ARCHIVE_TENANT"])   { $Tenant  = $dotEnv["ARCHIVE_TENANT"] }
    if (-not $CatalogueRoot -and $dotEnv["PERSON_CATALOGUE_ROOT"]) { $CatalogueRoot = $dotEnv["PERSON_CATALOGUE_ROOT"] }
    if ($BaseUrl -eq "http://localhost:3000" -and $dotEnv["ARCHIVE_BASE_URL"]) { $BaseUrl = $dotEnv["ARCHIVE_BASE_URL"] }
}

if (-not $CatalogueRoot) { Write-Error "-CatalogueRoot (or PERSON_CATALOGUE_ROOT) is required."; exit 1 }
if (-not $ApiKey)        { Write-Error "-ApiKey (or ARCHIVE_API_KEY) is required."; exit 1 }
if (-not (Test-Path -LiteralPath $CatalogueRoot -PathType Container)) {
    Write-Error "Catalogue root not found: $CatalogueRoot"; exit 1
}

$BaseUrl = $BaseUrl.TrimEnd("/")
$headers = @{ "x-archive-key" = $ApiKey }
if ($Tenant) { $headers["x-tenant-id"] = $Tenant }

$AVATAR_MAX_PX = 256
# The folder name is authoritative for the ICG-ID; the file may or may not repeat it.
$ICG_IN_NAME   = '\(([A-Z]{2}-[0-9]{2}[A-Z0-9@][A-Z0-9]*)\)'

# ── Portrait selection ────────────────────────────────────────────────────────
# The portrait lives in the person's `_meta` folder, beside the import file:
#
#   Saloma_(SX-00OWE)\_meta\Saloma_(SX-00OWE).jpg
#
# NOT in the person folder itself — that holds set folders. A first version looked
# only in the person folder and found 40 portraits out of 39,104.
#
# `_meta` also contains `_Cover\` and `_Videos\`, which are full of SET covers.
# Those must never be mistaken for a person's face, so this reads files directly
# in `_meta` and never descends.
#
# Prefer a file whose own name carries this person's ICG-ID — that is the
# convention and it is unambiguous. Only when a single image is present is it
# taken unnamed. Never guess between several: two unrelated images mean the
# convention was not followed, and picking one at random would put a stranger's
# face on the comparison panel.
function Select-Portrait {
    param([string]$FolderPath, [string]$IcgId)

    foreach ($dir in @((Join-Path $FolderPath "_meta"), $FolderPath)) {
        if (-not (Test-Path -LiteralPath $dir -PathType Container)) { continue }

        $files = @(Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue |
                   Where-Object { $_.Name -match '\.(jpe?g|png|webp)$' })
        if ($files.Count -eq 0) { continue }

        $keyed = @($files | Where-Object { $_.BaseName -like "*($IcgId)*" })
        if ($keyed.Count -ge 1) {
            # `Name_(ICG).jpg` and `Name_(ICG)_thumb.jpg` both occur; prefer the
            # smaller, which is the one already sized for this purpose.
            return ($keyed | Sort-Object Length | Select-Object -First 1).FullName
        }
        if ($files.Count -eq 1) { return $files[0].FullName }
    }
    return $null
}

function Resize-ToJpeg {
    param([string]$ImagePath, [int]$MaxPx)

    $img = [System.Drawing.Image]::FromFile($ImagePath)
    try {
        $ratio = [Math]::Min($MaxPx / $img.Width, $MaxPx / $img.Height)
        if ($ratio -gt 1) { $ratio = 1 }
        $w = [int][Math]::Max(1, [Math]::Round($img.Width  * $ratio))
        $h = [int][Math]::Max(1, [Math]::Round($img.Height * $ratio))

        $bmp = New-Object System.Drawing.Bitmap($w, $h)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.Clear([System.Drawing.Color]::White)
            $destRect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
            $g.DrawImage($img, $destRect, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel)

            $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
                     Where-Object { $_.MimeType -eq "image/jpeg" }
            $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
            $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]82)

            $tmp = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "pb-avatar-$([guid]::NewGuid()).jpg")
            $bmp.Save($tmp, $codec, $ep)
            return $tmp
        } finally { $g.Dispose(); $bmp.Dispose() }
    } finally { $img.Dispose() }
}

function Report-Failure {
    param([string]$IcgId, [string]$Message)
    try {
        Invoke-RestMethod -Uri "$BaseUrl/api/catalogue/avatar/$IcgId" `
            -Headers $headers -Method Post -ContentType "application/json" `
            -Body (@{ error = $Message } | ConvertTo-Json) | Out-Null
    } catch {
        Write-Warning "  could not report the failure for $IcgId : $($_.Exception.Message)"
    }
}

# ── Which portraits the app already has ───────────────────────────────────────
$known = @{}
if (-not $Force) {
    try {
        $resp = Invoke-RestMethod -Uri "$BaseUrl/api/catalogue/avatars" -Headers $headers -Method Get
        foreach ($id in $resp.icgIds) { $known[$id] = $true }
        Write-Host "App already holds $($known.Count) portrait(s); skipping those. Use -Force to re-upload."
    } catch {
        Write-Error "Could not read the existing portraits: $($_.Exception.Message)"
        exit 1
    }
}

# ── Walk ──────────────────────────────────────────────────────────────────────
Write-Host "Catalogue: $CatalogueRoot"
Write-Host "App:       $BaseUrl$(if ($Tenant) { "  [$Tenant]" })"
Write-Host "Collecting person folders…"

$personDirs = @(Get-ChildItem -LiteralPath $CatalogueRoot -Directory -ErrorAction SilentlyContinue |
                ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Directory -ErrorAction SilentlyContinue })
Write-Host "Found $($personDirs.Count) person folder(s)."

$stats = @{ uploaded = 0; skipped = 0; noImage = 0; noIcgId = 0; failed = 0 }
$i = 0
foreach ($dir in $personDirs) {
    $i++
    if ($Limit -gt 0 -and $stats.uploaded -ge $Limit) { break }

    if ($dir.Name -notmatch $ICG_IN_NAME) { $stats.noIcgId++; continue }
    $icgId = $Matches[1]
    if ((-not $Force) -and $known.ContainsKey($icgId) -and (-not $RetryFailed)) { $stats.skipped++; continue }

    $portrait = Select-Portrait -FolderPath $dir.FullName -IcgId $icgId
    if (-not $portrait) { $stats.noImage++; continue }

    # Printed BEFORE the decode: a GDI+ hang throws nothing, so the last line on
    # screen is the only record of which file caused it.
    Write-Host ("[{0}/{1}] {2}" -f $i, $personDirs.Count, $portrait)

    if ($DryRun) { $stats.uploaded++; continue }

    $tmp = $null
    try {
        $tmp = Resize-ToJpeg -ImagePath $portrait -MaxPx $AVATAR_MAX_PX
        # -InFile, not -Body: Invoke-RestMethod corrupts raw byte-array bodies.
        Invoke-RestMethod -Uri "$BaseUrl/api/catalogue/avatar/$icgId" `
            -Headers $headers -Method Post -ContentType "image/jpeg" -InFile $tmp | Out-Null
        $stats.uploaded++
    } catch {
        $msg = $_.Exception.Message
        Write-Warning "  FAILED $icgId : $msg"
        Report-Failure -IcgId $icgId -Message "$portrait -- $msg"
        $stats.failed++
    } finally {
        if ($tmp -and (Test-Path -LiteralPath $tmp)) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    }
}

Write-Host ""
Write-Host "Done."
Write-Host ("  uploaded          {0}" -f $stats.uploaded)
Write-Host ("  skipped (present) {0}" -f $stats.skipped)
Write-Host ("  no portrait found {0}" -f $stats.noImage)
Write-Host ("  no ICG-ID in name {0}" -f $stats.noIcgId)
Write-Host ("  FAILED            {0}" -f $stats.failed)
if ($stats.failed -gt 0) {
    Write-Host ""
    Write-Host "Failures are stored per person and listed in the maintenance check."
    Write-Host "Clean or re-encode the offending file, then re-run with -RetryFailed."
}
