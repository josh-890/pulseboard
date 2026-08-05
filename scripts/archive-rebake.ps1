<#
.SYNOPSIS
    Refines template-aligned images from their full-resolution archive originals
    (HD re-bake, ADR-0017). Pure PowerShell — no Node required.

.DESCRIPTION
    Pulseboard stores only a downscaled (<=4000px) copy of each photo, so aligned
    images that zoom into a small locus (eyes) can look soft. This script, run on the
    machine that holds the archive (same place you run archive-scan.ps1), pulls the
    eligible worklist from the app, reads each aligned image's ORIGINAL off the local
    disk, replays the exact alignment at full resolution (System.Drawing — the same
    transform the browser uses), and POSTs the small result back. The app overwrites
    the aligned image in place and marks it HD. Originals never leave this machine.

    Run a scan first (or use archive-scan.ps1 -Rebake) so the archive paths are
    freshly verified before re-baking.

    Authentication uses the shared x-archive-key header (same key as the scan).

.PARAMETER BaseUrl
    Base URL of the Pulseboard app. Default: ARCHIVE_BASE_URL or http://localhost:3000

.PARAMETER ApiKey
    API key. Default: ARCHIVE_API_KEY env var or a .env file next to the script.

.PARAMETER Tenant
    Tenant ID (e.g. "pulse"). Default: ARCHIVE_TENANT.

.PARAMETER PersonId
    Limit to one person's aligned images.

.PARAMETER SessionId
    Limit to one reference session.

.PARAMETER DryRun
    Report what would be re-baked; read + check but do not POST.

.PARAMETER Force
    Re-bake even when the original is not higher-resolution than the master.

.EXAMPLE
    .\archive-rebake.ps1 -BaseUrl http://10.66.20.65:3000 -ApiKey s3cr3t -Tenant pulse -DryRun

.NOTES
    Requires PowerShell 7+ on Windows: 7 for the `??` operator used below,
    Windows for System.Drawing / GDI+. No external deps.
#>

[CmdletBinding()]
param(
    [string]$BaseUrl   = ($env:ARCHIVE_BASE_URL ?? "http://localhost:3000"),
    [string]$ApiKey    = ($env:ARCHIVE_API_KEY  ?? ""),
    [string]$Tenant    = ($env:ARCHIVE_TENANT   ?? ""),
    [string]$PersonId  = "",
    [string]$SessionId = "",
    [switch]$DryRun,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# ── .env loader (mirrors archive-scan.ps1) ─────────────────────────────────────
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

$ASPECT_TOL = 0.02

# ── Bake geometry (ports src/lib/image/bake-geometry.ts + similarity-transform.ts) ──

function Get-BakeDimensions {
    param([double]$AspectW, [double]$AspectH, [double]$BakeLongSide)
    if ($AspectH -ge $AspectW) {
        return @{ w = [Math]::Round($BakeLongSide * $AspectW / $AspectH); h = [Math]::Round($BakeLongSide) }
    }
    return @{ w = [Math]::Round($BakeLongSide); h = [Math]::Round($BakeLongSide * $AspectH / $AspectW) }
}

# Umeyama 2D similarity fit → canvas-convention matrix (a,b,c,d,e,f):
#   x' = a*x + c*y + e ;  y' = b*x + d*y + f
function Get-SimilarityMatrix {
    param([array]$Src, [array]$Dst)  # arrays of @{ x; y }
    $n = [Math]::Min($Src.Count, $Dst.Count)
    if ($n -lt 2) { return $null }
    $cax = 0.0; $cay = 0.0; $cbx = 0.0; $cby = 0.0
    for ($i = 0; $i -lt $n; $i++) { $cax += $Src[$i].x; $cay += $Src[$i].y; $cbx += $Dst[$i].x; $cby += $Dst[$i].y }
    $cax /= $n; $cay /= $n; $cbx /= $n; $cby /= $n
    $dot = 0.0; $cross = 0.0; $srcSq = 0.0
    for ($i = 0; $i -lt $n; $i++) {
        $ax = $Src[$i].x - $cax; $ay = $Src[$i].y - $cay
        $bx = $Dst[$i].x - $cbx; $by = $Dst[$i].y - $cby
        $dot   += $ax * $bx + $ay * $by
        $cross += $ax * $by - $ay * $bx
        $srcSq += $ax * $ax + $ay * $ay
    }
    if ($srcSq -eq 0) { return $null }
    $sCos = $dot / $srcSq; $sSin = $cross / $srcSq
    $a = $sCos; $b = $sSin; $c = -$sSin; $d = $sCos
    $e = $cbx - ($a * $cax + $c * $cay)
    $f = $cby - ($b * $cax + $d * $cay)
    return @{ a = $a; b = $b; c = $c; d = $d; e = $e; f = $f }
}

# Ports visibleSourceRect() from src/lib/image/bake-geometry.ts (unit-tested there).
# The sub-rectangle of the source that actually lands inside the bake canvas: map the
# four output corners back through the inverse matrix, take the bounding box, pad for
# the interpolation kernel, clamp. Falls back to the whole image if anything is off.
function Get-VisibleSourceRect {
    param($M, [int]$BakeW, [int]$BakeH, [int]$SrcW, [int]$SrcH)
    $whole = @{ x = 0; y = 0; w = $SrcW; h = $SrcH }
    $det = $M.a * $M.d - $M.b * $M.c
    if ($det -eq 0 -or [double]::IsNaN($det) -or [double]::IsInfinity($det)) { return $whole }

    $invA =  $M.d / $det; $invB = -$M.b / $det
    $invC = -$M.c / $det; $invD =  $M.a / $det
    $invE = ($M.c * $M.f - $M.d * $M.e) / $det
    $invF = ($M.b * $M.e - $M.a * $M.f) / $det

    $x0 = [double]::PositiveInfinity; $y0 = [double]::PositiveInfinity
    $x1 = [double]::NegativeInfinity; $y1 = [double]::NegativeInfinity
    foreach ($c in @(@(0,0), @($BakeW,0), @(0,$BakeH), @($BakeW,$BakeH))) {
        $x = $invA * $c[0] + $invC * $c[1] + $invE
        $y = $invB * $c[0] + $invD * $c[1] + $invF
        if ($x -lt $x0) { $x0 = $x }; if ($y -lt $y0) { $y0 = $y }
        if ($x -gt $x1) { $x1 = $x }; if ($y -gt $y1) { $y1 = $y }
    }
    foreach ($v in @($x0, $y0, $x1, $y1)) {
        if ([double]::IsNaN($v) -or [double]::IsInfinity($v)) { return $whole }
    }

    # Kernel margin in SOURCE pixels: a downscaling bake samples several source
    # pixels per output pixel, so the padding has to grow accordingly.
    # Every argument is explicitly [double]: [Math]::Min/Max overload resolution on
    # mixed int/double arguments is ambiguous in PowerShell.
    $scale = [Math]::Sqrt($M.a * $M.a + $M.b * $M.b)
    if ($scale -le 0) { $scale = 1.0 }
    $margin = [double]([Math]::Ceiling(4.0 / [Math]::Min(1.0, [double]$scale)) + 4.0)

    $cx0 = [int][Math]::Max(0.0, [double]([Math]::Floor($x0) - $margin))
    $cy0 = [int][Math]::Max(0.0, [double]([Math]::Floor($y0) - $margin))
    $cx1 = [int][Math]::Min([double]$SrcW, [double]([Math]::Ceiling($x1) + $margin))
    $cy1 = [int][Math]::Min([double]$SrcH, [double]([Math]::Ceiling($y1) + $margin))
    $w = $cx1 - $cx0; $h = $cy1 - $cy0
    if ($w -le 0 -or $h -le 0) { return $whole }
    return @{ x = $cx0; y = $cy0; w = $w; h = $h }
}

function Invoke-Bake {
    param($Entry, [System.Drawing.Image]$Img)
    $dims = Get-BakeDimensions $Entry.template.aspectW $Entry.template.aspectH $Entry.template.bakeLongSide
    $bw = [int]$dims.w; $bh = [int]$dims.h

    $src = @(); $dst = @()
    foreach ($tk in $Entry.template.keypoints) {
        $frac = $Entry.keypoints.PSObject.Properties[$tk.name]
        if (-not $frac) { return $null }
        $src += @{ x = [double]$frac.Value.x * $Img.Width;  y = [double]$frac.Value.y * $Img.Height }
        $dst += @{ x = [double]$tk.x * $bw;                  y = [double]$tk.y * $bh }
    }
    $m = Get-SimilarityMatrix $src $dst
    if (-not $m) { return $null }

    $bmp = New-Object System.Drawing.Bitmap($bw, $bh)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
        $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.Clear([System.Drawing.Color]::White)
        # GDI+ Matrix(m11,m12,m21,m22,dx,dy) == canvas setTransform(a,b,c,d,e,f).
        $mtx = New-Object System.Drawing.Drawing2D.Matrix($m.a, $m.b, $m.c, $m.d, $m.e, $m.f)
        $g.Transform = $mtx
        # Map source PIXELS 1:1 into world space, then the transform. The 2-arg
        # DrawImage($img,0,0) instead draws at the image's DPI-based physical size,
        # silently rescaling it (e.g. 96/300) and wrecking the framing — the explicit
        # source-rectangle (in Pixel units) overload avoids that.
        #
        # Restrict BOTH rects to the region that survives the clip. Passing the whole
        # image makes GDI+ push every source pixel through HighQualityBicubic before
        # throwing ~93% of the result away; on a 47-megapixel original that stops
        # looking like slowness and starts looking like a hang. Source and dest rect
        # are the same rectangle because source pixels map 1:1 into world space, so
        # the framing is bit-identical to drawing the whole image.
        $r = Get-VisibleSourceRect $m $bw $bh $Img.Width $Img.Height
        $destRect = New-Object System.Drawing.Rectangle($r.x, $r.y, $r.w, $r.h)
        $g.DrawImage($Img, $destRect, $r.x, $r.y, $r.w, $r.h, [System.Drawing.GraphicsUnit]::Pixel)
        $mtx.Dispose()

        $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
        $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]92)
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, $codec, $ep)
        return $ms.ToArray()
    } finally {
        $g.Dispose(); $bmp.Dispose()
    }
}

function Get-Sha256Hex {
    param([string]$Path)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $fs = [System.IO.File]::OpenRead($Path)
        try { return ([BitConverter]::ToString($sha.ComputeHash($fs))).Replace("-", "").ToLower() }
        finally { $fs.Dispose() }
    } finally { $sha.Dispose() }
}

# ── Main ───────────────────────────────────────────────────────────────────────

Write-Host "Archive HD re-bake -> $BaseUrl$(if ($DryRun) { '  [dry-run]' })$(if ($Force) { '  [force]' })"
if ($Tenant) { Write-Host "Tenant: $Tenant" }

$qs = @()
if ($PersonId)  { $qs += "personId=$PersonId" }
if ($SessionId) { $qs += "sessionId=$SessionId" }
if ($Force)     { $qs += "includeHd=1" }  # -Force also redoes already-HD images (e.g. fix a bad bake)
$wlUrl = "$BaseUrl/api/archive/rebake-worklist"
if ($qs.Count -gt 0) { $wlUrl += "?" + ($qs -join "&") }

try {
    $wl = Invoke-RestMethod -Uri $wlUrl -Headers $headers -Method Get
} catch {
    Write-Error "Failed to fetch worklist: $_"; exit 1
}
$entries = @($wl.entries)
Write-Host "Eligible: $($wl.count) aligned image(s)"
Write-Host ""

$t = @{ rebaked = 0; would = 0; noGain = 0; missing = 0; mismatch = 0; failed = 0 }

$idx = 0
foreach ($e in $entries) {
    $idx++
    $file = Join-Path $e.fullPath $e.filename
    # Announce BEFORE the expensive part, by default (not under -Verbose). A
    # 47-megapixel original costs seconds-to-minutes in GDI+ HighQualityBicubic
    # with no output of its own, which reads as a hang; and if the decode dies or
    # wedges, this line is the only record of WHICH file did it.
    Write-Host ("[{0}/{1}] {2}" -f $idx, $entries.Count, $file)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        # Not Write-Verbose: MediaItem.filename is frozen at upload time and no scan
        # ever rewrites it, so a file renamed in the archive after upload is missing
        # here *permanently* — a rescan does not repair it. That needs to be visible
        # by default, not behind -Verbose.
        $t.missing++
        Write-Warning "MISSING  $($e.alignedMediaItemId)  <-  $file"
        continue
    }

    $img = $null
    try { $img = [System.Drawing.Image]::FromFile($file) }
    catch { $t.mismatch++; Write-Verbose "UNREADABLE  $file"; continue }

    try {
        # Integrity: exact hash, ELSE aspect. The aspect fallback is not a loophole,
        # it is the main path — the whole point of the re-bake is that the archive
        # holds a HIGHER-RESOLUTION rendition than the one that was uploaded (e.g.
        # uploaded 3000x2000, archive 4324x2883). Those are the same photograph and
        # will never share a byte hash; an exact hash match usually means "same file,
        # no gain". Requiring the hash therefore rejects precisely the images this
        # script exists to sharpen.
        #
        # The residual risk is a different photo with the same aspect ratio sitting at
        # the expected name. Aspect alone cannot tell that apart from a re-render —
        # only a perceptual hash could. Left as-is deliberately; see ADR-0017.
        # Aspect is checked FIRST because it is free — the dimensions are already
        # loaded — whereas the hash reads the whole multi-MB file off disk. Since the
        # test is hash-OR-aspect, an aspect hit means the hash is never needed.
        $srcAspect = [double]$e.sourceWidth / [double]$e.sourceHeight
        $aspectOk = ($srcAspect -gt 0) -and ([Math]::Abs(($img.Width / $img.Height) - $srcAspect) / $srcAspect -le $ASPECT_TOL)
        if (-not $aspectOk) {
            $hashOk = $false
            if ($e.sourceHash) { $hashOk = (Get-Sha256Hex $file) -eq $e.sourceHash }
            if (-not $hashOk) {
                $t.mismatch++
                Write-Warning "MISMATCH $($e.alignedMediaItemId)  <-  $file ($($img.Width)x$($img.Height) vs source $($e.sourceWidth)x$($e.sourceHeight)): neither hash nor aspect matches"
                continue
            }
        }

        # The current bake sampled the master_4000 (long side capped at 4000), so a
        # gain means the original is longer than that cap — even when it equals the
        # stored source dims (which may themselves exceed 4000).
        $masterCeil = [Math]::Min(4000, [Math]::Max([int]$e.sourceWidth, [int]$e.sourceHeight))
        $gain = [Math]::Max($img.Width, $img.Height) -gt $masterCeil
        if (-not $gain -and -not $Force) {
            $t.noGain++
            Write-Verbose "NO-GAIN  $file ($($img.Width)x$($img.Height))"
            continue
        }

        if ($DryRun) {
            $t.would++
            Write-Host "WOULD    $($e.alignedMediaItemId)  <-  $file ($($img.Width)x$($img.Height))"
            continue
        }

        # The bake MUST sit inside the try (mirrors the .ts agent, ADR-0017). GDI+
        # decodes JPEG pixels lazily — FromFile only reads the header, so a corrupt
        # or truncated original first blows up here, in DrawImage. With
        # $ErrorActionPreference = "Stop" and the bake outside the catch, that one
        # bad file used to terminate the entire run and never name itself.
        $tmpJpg = $null
        try {
            $bytes = Invoke-Bake -Entry $e -Img $img
            if (-not $bytes) {
                $t.failed++
                Write-Warning "FAILED   $($e.alignedMediaItemId): keypoints do not cover the template  <-  $file"
                continue
            }

            # POST via a temp file (-InFile), NOT -Body: Invoke-RestMethod corrupts raw
            # byte-array bodies, which makes the server reject the JPEG. -InFile streams
            # the bytes verbatim (like curl --data-binary).
            $tmpJpg = [System.IO.Path]::Combine($env:TEMP, ([Guid]::NewGuid().ToString() + ".jpg"))
            [System.IO.File]::WriteAllBytes($tmpJpg, $bytes)
            Invoke-RestMethod -Uri "$BaseUrl/api/archive/rebake/$($e.alignedMediaItemId)" `
                -Headers $headers -Method Post -InFile $tmpJpg -ContentType 'image/jpeg' | Out-Null
            $t.rebaked++
            # Timing by default: a pathologically slow original stands out immediately.
            Write-Host ("         OK  {0}x{1}  {2:n1}s" -f $img.Width, $img.Height, $sw.Elapsed.TotalSeconds)
        } catch {
            $t.failed++
            # Always name the file — the id alone can't be traced back to a path on disk.
            Write-Warning "FAILED   $($e.alignedMediaItemId)  <-  $file ($($img.Width)x$($img.Height)): $_"
        } finally {
            if ($tmpJpg) { Remove-Item -LiteralPath $tmpJpg -ErrorAction SilentlyContinue }
        }
    } finally {
        $img.Dispose()
    }
}

Write-Host ""
Write-Host "-- Summary ------------------------------------"
if ($DryRun) { Write-Host "  Would re-bake: $($t.would)" } else { Write-Host "  Re-baked:      $($t.rebaked)" }
Write-Host "  No-gain:       $($t.noGain)"
Write-Host "  Missing:       $($t.missing)"
Write-Host "  Mismatch:      $($t.mismatch)"
if ($t.failed -gt 0) { Write-Host "  Failed:        $($t.failed)" }
Write-Host "-----------------------------------------------"
