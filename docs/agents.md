# Agents — what runs where, and with which switches

Seven programs run **outside** the app, on the machines that hold the data. The app
server cannot reach the archive or the person catalogue, so everything that touches
those filesystems is an agent that pulls work from the app and pushes small results
back.

Common to all of them:

- **Run from a `pwsh` prompt.** They need PowerShell **7** (the `??` operator) and
  Windows (System.Drawing / GDI+). Double-clicking a `.ps1` opens it in an editor;
  it does not run it.
- **Config comes from a `.env` next to the script** — `ARCHIVE_BASE_URL`,
  `ARCHIVE_API_KEY`, `ARCHIVE_TENANT`, `ARCHIVE_PHOTOSET_ROOT`,
  `ARCHIVE_VIDEOSET_ROOT`, `PERSON_CATALOGUE_ROOT`. Anything passed on the command
  line wins. So the everyday call is usually just the script name.
- **`-DryRun` exists everywhere and is the right first move** after any change.
- **Originals never leave the machine** — with one deliberate exception:
  `archive-upload.ps1` sends a promoted set's images, exactly what a manual upload
  into the set would send. Everything else carries only thumbnails, signatures and
  small derived files.
- Authentication is the shared `x-archive-key` header.
- **Each run is reported** (archive scan, cover, upload — 2026-10-11): at its end the
  agent sends a one-line summary and its counters to `/api/archive/agent-runs`; the
  dashboard's **Agents** panel and activity show it. Dry runs are reported as such and
  not shown. A failed report never fails the run.

---

## Which one do I want?

| I want to… | Run |
|---|---|
| Check that linked sets are still on disk, file counts current | `.\archive-scan.ps1` |
| Find new / renamed / moved folders, refresh people files on disk | `.\archive-scan.ps1 -Mode Full` |
| …and re-bake HD images right after, on freshly verified paths | `.\archive-scan.ps1 -Mode Full -Rebake` |
| Give the archive workspace thumbnails to look at | `.\archive-cover.ps1` |
| Sharpen aligned images from their full-resolution originals | `.\archive-rebake.ps1` |
| Fill freshly promoted photo sets with their archive images | `.\archive-upload.ps1` |
| Give suggested people a face in the workbench | `.\catalogue-avatar.ps1` |
| Propose who is in the orphan archive folders | nothing to run — the app matches them after every scan and every catalogue run (ADR-0038 S5); **Match now** on `/people/contacts/runs` |
| Judge the whole catalogue before it becomes Contacts (ADR-0038, read-only) | `node catalogue-inventory.mjs --catalogue "H:\Models\thenude" --cache inventory.json` |
| Load the catalogue into the app as Contacts and catalogue sets (ADR-0038) | `node catalogue-load.mjs` (first time: a prod backup first) |

---

## Where the archive actually is

Three roots, held in the app's settings (`archive.photosetRoot`, `archive.videosetRoot`)
and mirrored in the agent's `.env`:

```
photosets   I:\Sites\        and  L:\Sites02\
videosets   L:\VSites\
```

Under each root the layout is `{root}\{channelFolder}\{year}\{folderName}`:

```
I:\Sites\MTA-METArchive\1999\1999-10-08-MTA Katya - Wings
L:\VSites\WX-Woodman\2012\2012-08-18-WX Lyen Parker - WCX Casting
```

Two things that catch people out. **Photosets live under two roots** — `I:\Sites` and
`L:\Sites02` — so "the archive root" is not a single path, and a `-Path` has to name
the one that channel is actually on. And **the same channel folder appears in both
trees**: `MPL-MPLStudios` exists under `I:\Sites` for its photosets and under
`L:\VSites` for its videosets.

The biggest channel folders, for scoping a run: `FJ-FemJoy` (11,506 folders),
`MPL-MPLStudios` (4,986), `MA-MetArt` (3,518), `W4B-Watch4Beauty` (3,181),
`AA-AmourAngels` (2,657).

---

## `archive-scan.ps1` — the filesystem walk

Keeps `ArchiveFolder` in step with the disk, and since ADR-0029 also writes the
people files. Never modifies your media.

**Targeted** (default) re-checks only folders behind confirmed links: is it still
there, how many files, is the video present. Cheap, safe to run often.

**Full** walks the roots: detects new folders, renames, cross-drive moves (via the
`archiveKey` in `_pulseboard.json`) and deletions, writes missing sidecars, then
refreshes `.pb\cast.json` and the per-root index.

```powershell
.\archive-scan.ps1                                   # targeted, the routine run
.\archive-scan.ps1 -Mode Full                        # the real reconciliation
.\archive-scan.ps1 -Mode Full -Path "I:\Sites\MPL-MPLStudios" -DryRun
.\archive-scan.ps1 -Mode Full -NoSidecarPrompt       # unattended / scheduled
.\archive-scan.ps1 -Mode Full -Rebake                # then hand over to the re-bake
```

| Switch | What it does, and when you need it |
|---|---|
| `-Mode Full` | The bidirectional walk. Everything below applies to it |
| `-Path <dir>` | Restrict the **whole run** — walk, sidecars and people files — to a full path under one of the three roots, not a channel name. Use it with `-Force` to keep a forced run quick. The per-root index is left alone on a scoped run, since it describes a whole root |
| `-Force` | Re-read every leaf, ignoring the mtime shortcut. **Needed after editing a file inside a folder** — see the trap below |
| `-NoSidecarPrompt` | Do not ask before writing `_pulseboard.json`; for scheduled runs |
| `-SkipPeople` | Skip `.pb\cast.json` and the per-root index |
| `-Rebake` / `-RebakeForce` | Run `archive-rebake.ps1` afterwards, on paths this scan just verified |
| `-BatchSize` | Folders per POST (default 200) |
| `-MigrateCast` | One-off: convert `_cast.txt` / `_people.txt` into markers in `.pb\` |
| `-SkipTargeted` | Skip the targeted sub-phase. Use for the first run **after moving folders between roots** — see below |
| `-Baseline` | Store the reported counts as the new normal **without** deriving CHANGED from the difference. For the one run after the counting rule changes — see below |
| `-DryRun` | Report only — including what the sidecar and people phases *would* write |

A dry run now goes all the way through: it walks, previews the delta it would send,
and then reports what the sidecar and people phases would write, without touching
anything. Until 2026-08-08 it returned right after the delta preview, so those two
phases — usually the ones you want to test — stayed silent.

**What counts as a file of a set:** media only — images and videos. Everything
tool-written now lives in `.pb\` inside the folder, so the media plane holds
only the set and `frames\`:

```
2011-01-16-MPL Talia - The Delicate Edge\
    …the images…
    .pb\
        pulseboard.json        identity anchor — the archiveKey that survives a move
        cast.json              generated: who the app knows is in this set
        Iveta_C_(IC-87VY)      your own marker (see below)
```

One exclude rule (`.pb\`) covers backup, dedup and verification runs. Per
archive root there is a derived `{root}\.pb\index.tsv` — delete it and grep
the folders if it ever looks wrong.

The counting rule changed on 2026-08-08 and the layout on 2026-08-09, so stored
counts are one or two too high. Both are corrected by exactly one run:

```powershell
.\archive-scan.ps1 -Mode Full -Force -Baseline -MigrateCast
```

**Telling the app who is in a set** — put one empty file per person into
`.pb\`, named `Name (ICG-ID)`:

```
.pb\Iveta_C_(IC-87VY)
.pb\Anna Y (AY-006S)
```

The name is the whole statement — content is never read, any extension is fine, and
underscores, spaces and capitalisation make no difference. Knowing that one person is
in twelve sets is twelve pastes of one file; a second person in a set is a second
file, with nothing to merge. Markers only **add**: deleting one takes nothing back.
`-MigrateCast` converts an older `_cast.txt` into markers, once.

**Marking a stub** (ADR-0032) — a folder filed on purpose as a placeholder (few
media, low quality) until the real set arrives. Put an empty file named `STUB` into
`.pb\` (an extension such as `.txt` is fine; any text inside becomes the
note):

```
.pb\STUB
```

The next Full run marks the folder as a stub in the app. It works the other way too:
mark or end a stub in the app and the next Full run writes or removes `STUB` — the
**only** file the scan ever changes for this; `pulseboard.json`, `cast.json` and your
markers are not touched. To upgrade, replace the **media** in the same folder and
leave `.pb\` alone; the stub ends when you delete `STUB` or press **End
stub** in the app, never because media changed. A folder carrying `STUB` is listed in
full on every run, because media overwritten under the same names do not move the
folder's mtime. A targeted run does not look at `STUB` at all. The summary line
reports `Stubs from STUB` / `Stubs ended` when either happened.

**Tagging a folder** (ADR-0034) — put one empty file per tag into `.pb\`,
named `#` + the tag name; qualify with the group when two groups share a name:

```
.pb\#outdoor
.pb\#outfit=bikini
```

Case, `_` for space and a short extension (`#outdoor.txt`) make no difference; an
alias of the tag works too. The next Full run hands the names to the app, which
tags the folder — or its Set, once the folder is confirmed to one. It works both
ways, per tag, like `STUB`: delete a file and the tag goes; add or remove a tag in the
app and the write phase (after the stub markers) creates or deletes the matching
`#…` file. It touches **only** `#…` files. A name the app does not know stays on disk
and shows on the archive row as a question; two files of one exclusive group
(`#indoor` + `#outdoor`) adopt neither and show a warning. A targeted run does not
read tags. The summary reports tags adopted / removed / unknown / conflicts.

**`.pulseboard\` → `.pb\` (2026-10-09).** The metadata folder was renamed so it is
quick to type. Nothing to do by hand: the first **Full** run renames every
`.pulseboard\` it meets (set folders and the archive root's `index.tsv` folder) to
`.pb\`. Where both exist — a `.pb\` you already created next to the old one — the
files move over; identical duplicates and generated files (`cast.json`,
`index.tsv`) yield to the `.pb\` copy, and anything else that differs (the anchor
`pulseboard.json`, a `STUB` note) stays in `.pulseboard\` with a warning to compare.
The summary line reports `Meta folders: N .pulseboard -> .pb`. Run it once with
`-DryRun` first to see the count. **Update exclude rules** in backup, dedup and
verification tools from `.pulseboard` to `.pb`. A targeted run does not rename.

A `.pb\` that Explorer draws **faded** carries the DOS hidden attribute —
Samba puts it on every dot-name, so a meta folder created from Linux, WSL or over the
share arrives hidden. The scan reads it with `-Force` and does not care, and neither
should you: the attribute is cosmetic, and clearing it is optional. (Before that fix
the walk died on the first hidden one with `Get-Item: Could not find item …
\.pb`, because `Test-Path` sees hidden items and `Get-Item` does not.)

**Right after moving folders between roots:** a Full run starts with the targeted
sub-phase, which checks the paths the app currently records — so every moved folder
is reported `MISSING`. That verdict is true of the old path and is corrected by the
walk a minute later, but it is written to the database in between. For that one run:

```powershell
.\archive-scan.ps1 -Mode Full -Force -SkipTargeted
```

Then scan normally; the targeted phase will find everything at its new path.

**The trap that costs the most time:** NTFS does *not* update a folder's timestamp
when a file **inside** it changes — only when an entry is added, removed or renamed.
So an edited `_cast.txt` is invisible to the mtime shortcut and a plain Full scan
will not see it. That is what `-Force` is for:

```powershell
.\archive-scan.ps1 -Mode Full -Force -Path "I:\Sites\MPL-MPLStudios\2011\2011-01-16-MPL Talia - The Delicate Edge"
```

---

## `archive-cover.ps1` — thumbnails for the archive workspace

Picks one image per folder, downscales it locally, POSTs only the thumbnail. The
workspace is otherwise a text-only tree, which makes judging tens of thousands of
orphan folders guesswork.

Selection: a stem ending in a lone `c` after any separator (`Title-c.jpg`,
`Title - c.jpg`); otherwise the first image by name. Videosets use `frames\`.

```powershell
.\archive-cover.ps1 -Limit 50 -DryRun     # cautious first pass
.\archive-cover.ps1                       # the rest; a re-run resumes
.\archive-cover.ps1 -RetryFailed          # revisit folders that failed before
```

| Switch | |
|---|---|
| `-Path <dir>` | Restrict to a subtree, same shape as the scan |
| `-Limit N` | At most N folders this run |
| `-RetryFailed` | Off by default, so a routine run does not grind through known-bad images |
| `-DryRun` | Pick and downscale, do not POST |

Failures are stored per folder, not just logged: listed under **Settings → System →
Archive Cover Coverage** and marked amber in the archive tree. A re-run only visits
folders without a cover, so it resumes by itself.

---

## `archive-rebake.ps1` — HD re-bake of aligned images (ADR-0017)

The app keeps only a ≤4000 px copy, so an aligned image that zooms into a small
locus (eyes) looks soft. This replays the exact alignment against the **original**
on disk at full resolution and posts the small result back.

```powershell
.\archive-rebake.ps1 -DryRun              # what is eligible
.\archive-rebake.ps1
.\archive-rebake.ps1 -PersonId <id>       # one person
.\archive-rebake.ps1 -Force               # even when not higher-resolution
```

Run a scan first so the archive paths are freshly verified — or let
`archive-scan.ps1 -Mode Full -Rebake` do both in the right order. The eligible count
is on the **Maintenance** page.

---

## `archive-upload.ps1` — fill promoted sets with their images

After a staged set is promoted, the set is empty until its pictures are uploaded.
This agent does it unattended:

```powershell
.\archive-upload.ps1 -DryRun        # which sets wait, how many images, which cover
.\archive-upload.ps1                # fill all of them
.\archive-upload.ps1 -Limit 5       # a few at a time
.\archive-upload.ps1 -SetId <id>    # one set
```

- **Queue** (the app decides): a photo set with a CONFIRMED archive folder that is on
  disk and **not a stub**, which **never had images** (the cover copied in at
  promotion does not count) — `Set.firstMediaAt` is set by
  the first image from any route (manual or agent) and never cleared, so deleting a
  set's images does not queue it again. Video sets are not filled.
- **Per set:** the folder's `jpg/jpeg/png/webp/gif`, numbered by file name in natural
  order (2 before 10). A designated cover (`Title-c.jpg`, `Title - c.jpg` — the cover
  agent's rule) is sent **first** so it becomes the set's cover. `bmp/tif` are listed
  as not uploadable.
- **Resumable:** the server skips an image already in the set (same SHA-256, or the
  same file name — a copy you uploaded by hand through the browser is re-encoded and
  hashes differently), and a set the agent started stays queued until it reports done
  — just run it again.
- **To-do tag** (2026-10-16): when the agent reports a set done (`/complete`), the
  server gives it the workflow tag `auto-uploaded` (source AUTO; tag and Workflow group
  are created if missing). It lists the set on the To-do tab of `/tags` until you
  remove it. Re-fetch runs skip `/complete`, so they never re-tag a set.
- **Damaged files** (2026-10-14; e.g. `VipsJpeg: premature end of JPEG image` — a
  truncated file) are **uploaded anyway**, decoded as far as they go, the way a browser
  shows them: missing parts come out grey, usually at the bottom. The log shows
  `⚠ uploaded damaged — <reason> (flagged)`; in the app the image gets a **red frame**,
  and the dashboard lists it under *Damaged images to check*. Open it: **Looks fine**
  clears the flag; replacing the file with a good copy clears it too.
- **A copy that arrived incomplete is fetched again — every run, until whole**
  (2026-10-15). If a file reaches the server shorter than its `Content-Length`, it is
  still stored as far as it decodes, with a red frame reading *Arrived incomplete
  (x of y MB) — the next archive upload run fetches it again*, and marked
  `MediaItem.archiveRetry`. The worklist then brings the finished set back with
  `retryFiles` (log: `(fetching N incomplete image(s) again)`): the agent sends only
  those files, the server swaps the whole file in (`↻ damaged copy replaced`) and
  drops the old variants, and the set's done mark and failed list stay as they were.
  **Looks fine**, replacing the file by hand, or deleting the picture stops the
  re-fetch. A damaged *original* (whole file, Sharp still fails) is not retried —
  sending it again changes nothing. A file named in `retryFiles` that is gone from the
  folder is reported as a warning and stays flagged.
- Background: until 2026-10-15 every file over **10 MB** reached the server cut off
  (the middleware's default body limit, now 110 MB via
  `experimental.proxyClientMaxBodySize`), so big archive images showed up "damaged"
  while the originals were fine. Migration `20261015120000_media_archive_retry`
  marked those copies for re-fetch.
- **Failures** — only files that are not images at all (and `bmp/tif`) — fail that
  file only; their names are stored on the set (`Set.archiveUploadFailed`) when the set
  is done — minus files already in the set. An entry comes off once a file of that name
  arrives in the set by any route (`pruneArchiveUploadFailed` in
  `archive-upload-failed.ts`); the dashboard's **Dismiss** clears the rest.
- A set you meanwhile filled by hand is refused and left alone.
- **One run at a time** (per tenant): the script holds a named lock
  (`Global\Pulseboard-archive-upload-<tenant>`) for the whole run. A second start —
  scheduled or by hand — prints "Another archive upload is still running — this start
  is skipped" and exits. A run that crashed leaves the lock abandoned; the next run
  takes it over. A dry run takes no lock.

### Run it every hour (Windows Task Scheduler)

Once, in PowerShell 7 (adjust `$script`):

```powershell
$script = "C:\Pulseboard\archive-upload.ps1"     # with its .env next to it
$logDir = Join-Path (Split-Path $script) "logs"
New-Item -ItemType Directory -Force $logDir | Out-Null
$action = New-ScheduledTaskAction -Execute "pwsh.exe" `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command `"& '$script' *>> '$logDir\archive-upload.log'`"" `
  -WorkingDirectory (Split-Path $script)
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddHours((Get-Date).Hour + 1) `
  -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "Pulseboard archive upload" -Action $action -Trigger $trigger -Settings $settings
```

- `-MultipleInstances IgnoreNew`: the scheduler skips the hour while the last run is
  still going (the script's own lock covers runs started by hand).
- `-ExecutionTimeLimit 0`: Windows otherwise stops a task after 72 hours.
- `pwsh.exe`, not `powershell.exe` — the script needs PowerShell 7.
- Output goes to `logs\archive-upload.log`; each run also shows on the dashboard.
- **Trap:** registered like this it runs only while you are logged on — which is what
  makes mapped drive letters (`X:\`) work. To run logged off, register with
  `-User`/`-Password` and make sure the archive paths need no drive letter (UNC).

## `catalogue-avatar.ps1` — a face for every suggested person

Walks `<CatalogueRoot>\<Initial>\<Common_Name_(ICG-ID)>\`, finds the portrait, posts
it downscaled, keyed on the ICG-ID. Without it the workbench asks "is this folder
this person" with nothing but a name to go on — of 5,074 suggested persons on
xpulse, 4,269 had no record at all.

```powershell
.\catalogue-avatar.ps1 -CatalogueRoot "H:\Models\thenude" -Limit 50 -DryRun
.\catalogue-avatar.ps1 -CatalogueRoot "H:\Models\thenude"
.\catalogue-avatar.ps1 -CatalogueRoot "H:\Models\thenude" -RetryFailed
```

| Switch | |
|---|---|
| `-CatalogueRoot` | Or `PERSON_CATALOGUE_ROOT` in the `.env` |
| `-Limit N` | Counts **attempts**, not successes |
| `-RetryFailed` | Revisit people that failed |
| `-Force` | Replace a portrait that is already there |
| `-DryRun` | Find and downscale, do not POST |

The portrait lives in the person's `_meta\` folder, not the person folder itself —
and `_meta\_Cover\` is deliberately not descended into. The run aborts after 10
consecutive failures rather than grinding through a broken share.

---

## `catalogue-join` — retired (ADR-0038 S5, 2026-10-29)

The app now matches archive folders against the catalogue itself, from the catalogue sets
`catalogue-load.mjs` keeps current: after every archive scan (the folders it found) and after
every catalogue run or its Undo (every folder still without a set), or on **Match now** on
`/people/contacts/runs`. It weighs date (required), channel (import alias only), alias and
title on an evidence ladder — see the user guide, *Archive matching*. Delete any old
`catalogue-join.mjs` and `catalogue.json` on the Windows box; they are not used any more.

---

## `catalogue-inventory.ts` / `catalogue-inventory.mjs` — judge the catalogue before it becomes Contacts (ADR-0038)

**Read-only.** Walks every `<Initial>\<Name_(ICG-ID)>\_meta\` folder, judges it with the
app's **own parser** (so "clean" in the report means clean in the app), asks the app what it
already holds (two GETs: `/api/catalogue/inventory-context` and the attribution worklist),
and writes an **Excel workbook**. Nothing is sent to the app.

```powershell
# from a repo checkout, run from the repo ROOT
npx tsx scripts/catalogue-inventory.ts --catalogue "H:\Models\thenude" --cache inventory.json

# as one copyable file
npm run build:agent        # → dist-agents/catalogue-inventory.mjs (and catalogue-load.mjs)
node catalogue-inventory.mjs --catalogue "H:\Models\thenude" --cache inventory.json
```

| Flag | |
|---|---|
| `--catalogue DIR` | Required (or `PERSON_CATALOGUE_ROOT`) |
| `--cache FILE` | **Use it.** The walk reads every import file version and samples covers; the cache holds only what is on disk, the app side is fetched fresh every run |
| `--rewalk` | Walk again — after the catalogue on disk changed, or after fixing quarantined folders |
| `--out FILE` | The workbook (default `catalogue-inventory-<date>.xlsx`) |
| `--limit N` | Only the first N person folders — a quick look; no cache is written |
| `--offline` | Don't ask the app: data health and cost only |
| `--base-url`, `--api-key`, `--tenant` | Default to the `ARCHIVE_*` env vars |

**The workbook.** *Summary* holds the go/no-go numbers: data health, overlap with the app
(already a Person → hint only, a Contact → enriched, an ignored Contact, new), payoff for set
promotion (open staged sets waiting on a cast member who is not a developed Person — a thin
Contact made by the import does not count — and how many of those become recognisable, with or
without a portrait), for the archive (orphan folders whose person token gets a catalogue name,
by name only — `catalogue-join` matches by set) and the network, the projected cost, and the channels: integrity (sets and open staged sets without a channel, archive channel folders no channel claims) and which catalogue channel names are linked — through an import alias only; a same-name channel is listed as a hint, never counted as a link (sheets *Channel integrity*, *Catalogue channels*). A cached
run needs no re-walk to pick up a newer app; an app too old for the agent stops it with a message. Then one
sheet per problem kind — the fix-list — plus *Persons (hint only)*, *Staged casts*,
*Archive names* and *All folders*.

| Kind | Meaning |
|---|---|
| Q1–Q5 **quarantine** (no Contact) | no import file · unreadable · no/malformed ICG-ID · folder / file name / file ICG-IDs disagree · the same ICG-ID in several folders. A quarantined folder lists only why; its flags show on the run after it is fixed |
| F1–F6 **flag** (identity taken, part marked) | polluted header · section cut off, or the biography claims far more sets than listed · mangled name · portrait missing, ambiguous or refused by the app · sampled cover unreadable · an older file version holds sets/aliases the newest lacks |

**No-go:** 10 % or more quarantined → fix the scrapes first and `--rewalk`.

**Portraits** are judged by the app, not the agent: it reads which ones `catalogue-avatar.ps1`
sent and which the app refused (strict decode). Run the avatar agent first for a complete
picture; the Summary says how many were not sent yet.

**Covers** are checked on a stable ~5 % sample. With `sharp` importable (a repo checkout, or
`npm i sharp` next to the `.mjs`) each one is fully decoded, strictly; without it only the
structure is checked (cut off, wrong format). The Summary names which.

---

## `catalogue-load.ts` / `catalogue-load.mjs` — load the catalogue (ADR-0038)

Every catalogue identity becomes a **Contact** (never a Person), every set goes into the catalogue
set table, each folder's newest import file is kept in MinIO (for Develop), and what is wrong lands on
the runs page — **/people/contacts/runs** — where the latest run can be **undone**.

```powershell
# the very first load — on the WSL side, a backup the app checks (≤ 24 h old):
#   bash scripts/tenant-backup.sh xpulse
node catalogue-load.mjs --dry-run      # how many folders would be sent
node catalogue-load.mjs --limit 200    # a first look (nothing is marked gone)
node catalogue-load.mjs                # the load
```

It reads `PERSON_CATALOGUE_ROOT`, `ARCHIVE_BASE_URL`, `ARCHIVE_API_KEY`, `ARCHIVE_TENANT` from the `.env`
next to it. The app does all judging with its own parser — the agent only reads files.

| Flag | What it does |
|---|---|
| `--catalogue DIR` | Catalogue root, else `PERSON_CATALOGUE_ROOT` |
| `--all` | Send every folder, changed or not (a full pass) |
| `--limit N` | Only the first N folders; folders not seen are **not** marked gone |
| `--batch N` | Folders per request (default 25) |
| `--dry-run` | Count what would be sent; open no run |
| `--watch` | **One scheduled pass** (S7): deliver the covers the app wants, then send catalogue changes — a run is opened only when a folder changed or went; never the first load. One log line |
| `--covers` | Only deliver the wanted covers (no catalogue walk) |

- **Only changes are sent.** The app answers the folder index with what it holds; a folder whose
  import files (name, size, time) and image names are unchanged is skipped. A run that changes
  nothing leaves no entry.
- **The first load is refused** without a prod backup from the last 24 hours —
  `bash scripts/tenant-backup.sh xpulse` records it (`Setting backup.lastAt`) once the dump is complete.
- **One folder fails alone:** it comes back as *failed* with its error, the run goes on.
- **A folder gone from the catalogue** is never deleted: its Contact is marked "no longer in the
  catalogue" (only on a run without `--limit`).
- **Persons are never written** — their folder, file and sets are kept as a hint.
- **Q1–Q5 quarantine** (no Contact), **F1–F6 flags** (Contact taken, part marked) — the same
  taxonomy as the inventory. Fix a file on the drive and run again: it drops off the list.
- **Undo** (runs page): latest run first. Removes what the run created and restores what it
  changed; a Contact you worked with (name, portrait, note, ignored, credits, links, archive
  folders) stays, only her catalogue data goes. Stored files stay in MinIO (harmless).
- If a run is interrupted it stays *running*; the next run, two hours later at the earliest,
  marks it failed (it can still be undone).
- **One load at a time:** a lock file (`%TEMP%\pulseboard-catalogue-load[-tenant].lock`, holding the
  pid) makes a second start — scheduled or by hand — print "another catalogue load is still running —
  this start is skipped". A crashed run's lock is taken over.

### Covers on request (S7)

Set covers stay in `_meta\_Cover\` (photo) and `_meta\_Videos\` (video) until a set is worked on.
**Develop**, **Review** of a newer file and **opening a staged set without a cover** record what is
wanted; each pass looks in the catalogue folders of the set's cast (subject first) for an image whose
name holds the **CoverId** as a whole token (`…-13850.jpg`, never `138501.jpg`), photo folder first for a
photo set, and sends it. The app decodes it **strictly** — a damaged file is refused with the reason —
and downscales it like an upload. Not found / damaged are listed on the runs page (**Ask again** after
fixing it on the drive). A cover you uploaded meanwhile always stays.

### Run it every 15 minutes (Windows Task Scheduler)

After the first load (by hand), once, in PowerShell 7 (adjust `$dir` — the folder with
`catalogue-load.mjs` and its `.env`):

```powershell
$dir = "C:\Pulseboard"
$logDir = Join-Path $dir "logs"
New-Item -ItemType Directory -Force $logDir | Out-Null
$action = New-ScheduledTaskAction -Execute "pwsh.exe" `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -Command `"node '$dir\catalogue-load.mjs' --watch *>> '$logDir\catalogue-load.log'`"" `
  -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "Pulseboard catalogue" -Action $action -Trigger $trigger -Settings $settings
```

- Each pass writes **two lines** to `logs\catalogue-load.log` — `pass started` and, at its end, what it
  did (`covers … | catalogue unchanged | 234 s`) — and reports itself to the runs page (*Scheduled agent
  and covers*: *pass running since …* while it walks, then the last pass and covers; an amber line after
  an hour without a pass). The walk over ~39k folders takes about 4 minutes.
- A pass with no change opens **no run** — the runs list only shows runs that did something.
- Same trap as the archive upload: registered like this it runs while you are logged on, which is
  what makes drive letters like `H:\` work. Box off or logged off → nothing happens until it is back.
- `-WindowStyle Hidden` keeps the console out of the way; a short flash can still show.
- Stop it: `Unregister-ScheduledTask -TaskName "Pulseboard catalogue"`.

## When you have added new sets to the archive

```powershell
.\archive-scan.ps1 -Mode Full                                              # register them
.\archive-cover.ps1                                                        # thumbnails
.\catalogue-avatar.ps1                                                     # only if the matching named faceless people
```

The scan's new folders are matched against the catalogue by the app on its own.

Then in the app: **Attribution queue → workbench**, then **Develop**. After promoting
staged sets, `.\archive-upload.ps1` fills them with their images.

Nothing else belongs in this sequence. `-Force` is for a file edited *inside* an unchanged
folder, `-Path` narrows a run and switches deletion detection off, `-Baseline` and
`-MigrateCast` were one-off migrations, `-SkipTargeted` is for the run right after moving
folders between roots, and `archive-rebake.ps1` has nothing to do with new sets.

One loop closes a round later: step 1 writes `.pb\cast.json` only for folders the app
already knows people for. For brand-new folders it does not yet, so their cast files appear on
the **next** Full scan, after you have confirmed the attributions. That delay is inherent — the
app has no route to the archive filesystem.

---

## Importing a person you have already marked in the archive

Her markers and her import meet in four records that live on four pages — the
Person, her staged sets, the marked folders, and the links between them. When the
result looks wrong the question is always which of the four disagrees, so take a
snapshot at each step:

```bash
npx tsx scripts/import-test-snapshot.ts <ICG-ID>          # xpulse; --dev for the dev DB
```

1. **Before the import.** How many folders propose her, which of them carry your
   own markers, whether a ghost `Contact` already exists. This is the baseline.
2. **Import the file.** The snapshot should now show the Person, her staged sets,
   and no Contact — the import retires the ghost.
3. **Match.** Nothing links itself: the scan records folders, matching compares
   them to sets. Newly imported sets need **Re-match** on `/archive`, or *Search
   archive* on the single set. Expect HIGH for a folder whose name carries one of
   her aliases on the set's release day; the snapshot marks anything below HIGH
   with ⚠, which is where a same-day folder for a *different* person shows up.
4. **Confirm the links.** A confirmed link settles the folder, so it leaves the
   attribution queue — including "My markers". That is correct and not a loss:
   the linked set's cast now answers "who is in this folder", and the next Full
   scan writes her into the folder's `cast.json`. A marker only becomes a claim
   for folders no set ever arrives for.
5. **Promote.** The archive link moves to the Set; the staged cover is copied into
   the Set's session. A publisher cover stays the cover; an archive thumbnail is a
   stand-in that the first uploaded image replaces (ADR-0031).

The snapshot earns its keep on the tangled ones — a person spread over many
channels, or credited under a different name in every folder.

---

## A routine round, in order

1. `.\archive-scan.ps1 -Mode Full` — the disk truth first; everything else works
   from what it records, and it refreshes the people files on disk.
2. `.\archive-cover.ps1` — new folders get thumbnails so they can be judged.
3. Nothing — the app matches the new folders against the catalogue by itself.
4. `.\catalogue-avatar.ps1` — only when the matching proposed people who have no face yet.
5. `.\archive-rebake.ps1` — or fold it into step 1 with `-Rebake`.

Then the work moves into the app: **Archive → Attribution queue** → workbench, and
`/archive/conflicts` for anything the app and your own claims disagree about.
