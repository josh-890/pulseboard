<#
.SYNOPSIS
    Fills promoted photo sets with the images of their archive folder.

.DESCRIPTION
    Promoting a staged set links it to its archive folder, but the set stays empty
    until its pictures are uploaded. This agent does the upload: it asks the app
    which sets are waiting, then sends every image of each set's folder, one at a
    time, exactly as a manual upload into the set would (the server builds the
    variants and links the images to the set and its models).

    Which sets are queued (decided by the app, GET /api/archive/upload-worklist):
      - a CONFIRMED archive folder that is a photo set (not a video set),
        present on disk and NOT a stub (.pb\STUB — upload once the real set is in);
      - the set NEVER had images (Set.firstMediaAt is set by the first image from
        any route and never cleared), or this agent started it and did not finish.

    Order inside a set: images are numbered by file name (natural order: 2 before
    10). A designated cover — a stem ending in a lone "c" after a separator, as in
    "Title-c.jpg" or "Title - c.jpg" (the cover agent's rule) — is sent FIRST so it
    becomes the set's cover; its place in the set still follows its name.

    Robustness:
      - every file runs on its own; a corrupt image fails that file, not the set;
      - an image already in the set (same SHA-256) is skipped by the server, so an
        interrupted run is simply started again;
      - at the end of each set the names of the failed files are sent to the app
        and kept on the set; the set then leaves the queue.

.PARAMETER SetId
    Upload only this set (it must still be waiting).
.PARAMETER Limit
    Process at most N sets this run.
.PARAMETER DryRun
    List what would be uploaded; send nothing.
.EXAMPLE
    .\archive-upload.ps1 -DryRun
    .\archive-upload.ps1 -Limit 5
    .\archive-upload.ps1 -SetId cmabc123
.NOTES
    Requires PowerShell 7+. Reads ARCHIVE_BASE_URL / ARCHIVE_API_KEY / ARCHIVE_TENANT
    from the environment or a .env next to the script (same as archive-scan.ps1).
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = ($env:ARCHIVE_BASE_URL ?? "http://localhost:3000"),
    [string]$ApiKey  = ($env:ARCHIVE_API_KEY  ?? ""),
    [string]$Tenant  = ($env:ARCHIVE_TENANT   ?? ""),
    [string]$SetId   = "",
    [int]$Limit      = 0,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# ── .env loader (mirrors archive-scan.ps1) ────────────────────────────────────
$dotEnvPath = Join-Path $PSScriptRoot ".env"
if (Test-Path -LiteralPath $dotEnvPath -PathType Leaf) {
    $dotEnv = @{}
    Get-Content -LiteralPath $dotEnvPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
            $dotEnv[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    if (-not $ApiKey -and $dotEnv["ARCHIVE_API_KEY"]) { $ApiKey = $dotEnv["ARCHIVE_API_KEY"] }
    if ($BaseUrl -eq "http://localhost:3000" -and $dotEnv["ARCHIVE_BASE_URL"]) { $BaseUrl = $dotEnv["ARCHIVE_BASE_URL"] }
    if (-not $Tenant -and $dotEnv["ARCHIVE_TENANT"]) { $Tenant = $dotEnv["ARCHIVE_TENANT"] }
}
if (-not $ApiKey) { throw "ARCHIVE_API_KEY is not set (environment or .env next to the script)." }
$BaseUrl = $BaseUrl.TrimEnd("/")

$headers = @{ "x-archive-key" = $ApiKey }
if ($Tenant) { $headers["x-tenant-id"] = $Tenant }

# What the server accepts; anything else in the folder is not a set image.
$MimeByExt = @{
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".png"  = "image/png"
    ".webp" = "image/webp"
    ".gif"  = "image/gif"
}
# Media the scan counts but the app cannot take as a set image — reported, not sent.
$OtherImageExt = @(".bmp", ".tif", ".tiff")

# Natural order: "img2.jpg" before "img10.jpg".
function Get-NaturalKey {
    param([string]$Name)
    return [regex]::Replace($Name.ToLowerInvariant(), '\d+', { param($m) $m.Value.PadLeft(12, '0') })
}

# The designated-cover marker, the same pattern as archive-cover.ps1 ($COVER_PATTERN):
# a stem ending in a lone "c" after any non-alphanumeric separator — "Title-c.jpg",
# "Title - c.jpg". -match is case-insensitive.
$COVER_PATTERN = '(^|[^a-z0-9])c\.(jpe?g|png|webp)$'
function Test-DesignatedCover {
    param([System.IO.FileInfo]$File)
    return $File.Name -match $COVER_PATTERN
}

# HttpClient, not Invoke-RestMethod -InFile: archive paths may contain [ and ],
# which PowerShell paths read as wildcards; the bytes are read here and sent as is.
$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromMinutes(10)
foreach ($k in $headers.Keys) { [void]$client.DefaultRequestHeaders.TryAddWithoutValidation($k, $headers[$k]) }

function Send-Image {
    param([string]$TargetSetId, [System.IO.FileInfo]$File, [string]$Mime, [int]$SortOrder)
    $url = "$BaseUrl/api/archive/set-upload/$TargetSetId" +
        "?filename=$([uri]::EscapeDataString($File.Name))&sortOrder=$SortOrder"
    $content = [System.Net.Http.ByteArrayContent]::new([System.IO.File]::ReadAllBytes($File.FullName))
    $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new($Mime)
    try {
        $resp = $client.PostAsync($url, $content).GetAwaiter().GetResult()
        $text = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    } finally {
        $content.Dispose()
    }
    $body = $null
    try { $body = $text | ConvertFrom-Json } catch { }
    if (-not $resp.IsSuccessStatusCode) {
        $msg = if ($body -and $body.error) { [string]$body.error } else { "HTTP $([int]$resp.StatusCode)" }
        return @{ status = "error"; reason = $msg }
    }
    return @{ status = [string]$body.status; reason = [string]$body.reason }
}

# ── Run report (dashboard "Agents" panel, 2026-10-11) ─────────────────────────
# One line plus the counters, sent at the end. A failed report never fails the run.
$script:RunStart = (Get-Date).ToUniversalTime()
function Send-AgentRun {
    param([string]$Agent, [string]$Summary, [bool]$Ok = $true, [System.Collections.IDictionary]$Details = @{})
    try {
        $payload = ConvertTo-Json -Depth 5 -InputObject @{
            agent     = $Agent
            startedAt = $script:RunStart.ToString("o")
            ok        = $Ok
            dryRun    = [bool]$DryRun
            summary   = $Summary
            details   = $Details
        }
        Invoke-RestMethod -Uri "$BaseUrl/api/archive/agent-runs" -Headers $headers -Method Post `
            -Body $payload -ContentType "application/json" | Out-Null
    } catch {
        Write-Verbose "Run report not sent: $_"
    }
}

# ── Worklist ──────────────────────────────────────────────────────────────────
Write-Host "Archive upload — base URL: $BaseUrl$(if ($Tenant) { " · tenant: $Tenant" })$(if ($DryRun) { ' (dry run)' })"
$query = @()
if ($SetId) { $query += "setId=$([uri]::EscapeDataString($SetId))" }
if ($Limit -gt 0) { $query += "limit=$Limit" }
$wlUrl = "$BaseUrl/api/archive/upload-worklist$(if ($query.Count) { '?' + ($query -join '&') })"
$sets = @((Invoke-RestMethod -Uri $wlUrl -Headers $headers -Method Get).sets | Where-Object { $_ })
if ($sets.Count -eq 0) {
    Write-Host "No set is waiting for its archive images."
    Send-AgentRun -Agent "archive-upload" -Summary "nothing waiting"
    return
}
Write-Host "$($sets.Count) set(s) waiting."

$tot = @{ sets = 0; uploaded = 0; skipped = 0; failed = 0; notImages = 0; setsAborted = 0 }
$sw = [System.Diagnostics.Stopwatch]::StartNew()

foreach ($s in $sets) {
    $folder = [string]$s.folderPath
    Write-Host ""
    Write-Host "▶ $($s.title)  [$($s.setId)]$(if ($s.resume) { '  (resuming)' })"
    Write-Host "  $folder"
    if (-not (Test-Path -LiteralPath $folder -PathType Container)) {
        Write-Warning "  Folder not found on this machine — skipped (it stays queued)."
        $tot.setsAborted++
        continue
    }

    $all = @(Get-ChildItem -LiteralPath $folder -File -ErrorAction Stop)
    $images = @($all | Where-Object { $MimeByExt.ContainsKey($_.Extension.ToLowerInvariant()) } |
        Sort-Object { Get-NaturalKey $_.Name })
    $others = @($all | Where-Object { $OtherImageExt -contains $_.Extension.ToLowerInvariant() })
    if ($images.Count -eq 0) {
        Write-Warning "  No uploadable images (jpg, png, webp, gif) — skipped (it stays queued)."
        $tot.setsAborted++
        continue
    }

    # Positions follow the names; a designated cover is sent first so it becomes the cover
    $order = @{}
    for ($i = 0; $i -lt $images.Count; $i++) { $order[$images[$i].FullName] = $i }
    $cover = $images | Where-Object { Test-DesignatedCover $_ } | Select-Object -First 1
    $sendList = @(if ($cover) { $cover }) + @($images | Where-Object { -not $cover -or $_.FullName -ne $cover.FullName })

    Write-Host ("  {0} image(s){1}{2}" -f $images.Count,
        $(if ($cover) { " · cover: $($cover.Name)" } else { " · cover: first by name" }),
        $(if ($others.Count) { " · $($others.Count) bmp/tif not uploadable" } else { "" }))
    if ($DryRun) { continue }

    $failed = [System.Collections.ArrayList]::new()
    foreach ($o in $others) { [void]$failed.Add("$($o.Name) (unsupported type)") }
    $tot.notImages += $others.Count
    $aborted = $false
    $n = 0
    foreach ($f in $sendList) {
        $n++
        Write-Host ("  [{0}/{1}] {2}" -f $n, $sendList.Count, $f.Name) -NoNewline
        try {
            $r = Send-Image -TargetSetId $s.setId -File $f -Mime $MimeByExt[$f.Extension.ToLowerInvariant()] -SortOrder $order[$f.FullName]
        } catch {
            $r = @{ status = "error"; reason = $_.Exception.Message }
        }
        switch ($r.status) {
            "uploaded" { Write-Host "  ✓"; $tot.uploaded++ }
            "skipped"  { Write-Host "  = already in the set"; $tot.skipped++ }
            "refused"  {
                # A set-level refusal (images added by hand meanwhile, no session) stops the set
                if ($r.reason -match 'set (already|not found)|primary session') {
                    Write-Host ""
                    Write-Warning "  Set refused: $($r.reason) — stopping this set."
                    $aborted = $true
                } else {
                    Write-Host "  ✗ $($r.reason)"
                    [void]$failed.Add("$($f.Name) ($($r.reason))"); $tot.failed++
                }
            }
            default {
                Write-Host "  ✗ $($r.reason)"
                [void]$failed.Add("$($f.Name) ($($r.reason))"); $tot.failed++
            }
        }
        if ($aborted) { break }
    }
    if ($aborted) { $tot.setsAborted++; continue }

    try {
        $payload = ConvertTo-Json -InputObject @{ failed = @($failed) } -Depth 3
        Invoke-RestMethod -Uri "$BaseUrl/api/archive/set-upload/$($s.setId)/complete" -Headers $headers `
            -Method Post -Body $payload -ContentType "application/json" | Out-Null
        $tot.sets++
        Write-Host ("  Done{0}" -f $(if ($failed.Count) { " — $($failed.Count) file(s) not uploaded, listed on the set" } else { "" }))
    } catch {
        Write-Warning "  Could not mark the set done: $_ (a re-run resumes it)"
    }
}

$client.Dispose()
Write-Host ""
Write-Host "── Summary ($([int]$sw.Elapsed.TotalMinutes) min) ──"
if ($DryRun) {
    Write-Host "  Dry run — nothing sent. $($sets.Count) set(s) would be filled."
} else {
    Write-Host "  Sets filled:       $($tot.sets)"
    Write-Host "  Images uploaded:   $($tot.uploaded)"
    if ($tot.skipped)     { Write-Host "  Already in set:    $($tot.skipped)" }
    if ($tot.failed)      { Write-Host "  Failed:            $($tot.failed) (listed on their sets)" }
    if ($tot.notImages)   { Write-Host "  bmp/tif skipped:   $($tot.notImages)" }
    if ($tot.setsAborted) { Write-Host "  Sets left queued:  $($tot.setsAborted) (see warnings)" }
}

Send-AgentRun -Agent "archive-upload" -Ok ($tot.failed -eq 0 -and $tot.setsAborted -eq 0) `
    -Summary ("{0} set(s) · {1} images{2}{3}" -f $tot.sets, $tot.uploaded,
        $(if ($tot.failed) { " · $($tot.failed) failed" } else { "" }),
        $(if ($tot.setsAborted) { " · $($tot.setsAborted) left queued" } else { "" })) `
    -Details @{ sets = $tot.sets; uploaded = $tot.uploaded; skipped = $tot.skipped; failed = $tot.failed; setsLeftQueued = $tot.setsAborted }
