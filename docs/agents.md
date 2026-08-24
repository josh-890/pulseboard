# Agents — what runs where, and with which switches

Five programs run **outside** the app, on the machines that hold the data. The app
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
- **Originals never leave the machine.** Only thumbnails, signatures and small
  derived files travel.
- Authentication is the shared `x-archive-key` header.

---

## Which one do I want?

| I want to… | Run |
|---|---|
| Check that linked sets are still on disk, file counts current | `.\archive-scan.ps1` |
| Find new / renamed / moved folders, refresh people files on disk | `.\archive-scan.ps1 -Mode Full` |
| …and re-bake HD images right after, on freshly verified paths | `.\archive-scan.ps1 -Mode Full -Rebake` |
| Give the archive workspace thumbnails to look at | `.\archive-cover.ps1` |
| Sharpen aligned images from their full-resolution originals | `.\archive-rebake.ps1` |
| Give suggested people a face in the workbench | `.\catalogue-avatar.ps1` |
| Propose who is in the orphan archive folders | `node catalogue-join.mjs --catalogue "H:\Models\thenude" --cache catalogue.json` |
| …and actually write those proposals into the queue | same, plus `--post` |

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
refreshes `.pulseboard\cast.json` and the per-root index.

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
| `-SkipPeople` | Skip `.pulseboard\cast.json` and the per-root index |
| `-Rebake` / `-RebakeForce` | Run `archive-rebake.ps1` afterwards, on paths this scan just verified |
| `-BatchSize` | Folders per POST (default 200) |
| `-MigrateCast` | One-off: convert `_cast.txt` / `_people.txt` into markers in `.pulseboard\` |
| `-SkipTargeted` | Skip the targeted sub-phase. Use for the first run **after moving folders between roots** — see below |
| `-Baseline` | Store the reported counts as the new normal **without** deriving CHANGED from the difference. For the one run after the counting rule changes — see below |
| `-DryRun` | Report only — including what the sidecar and people phases *would* write |

A dry run now goes all the way through: it walks, previews the delta it would send,
and then reports what the sidecar and people phases would write, without touching
anything. Until 2026-08-08 it returned right after the delta preview, so those two
phases — usually the ones you want to test — stayed silent.

**What counts as a file of a set:** media only — images and videos. Everything
tool-written now lives in `.pulseboard\` inside the folder, so the media plane holds
only the set and `frames\`:

```
2011-01-16-MPL Talia - The Delicate Edge\
    …the images…
    .pulseboard\
        pulseboard.json        identity anchor — the archiveKey that survives a move
        cast.json              generated: who the app knows is in this set
        Iveta_C_(IC-87VY)      your own marker (see below)
```

One exclude rule (`.pulseboard\`) covers backup, dedup and verification runs. Per
archive root there is a derived `{root}\.pulseboard\index.tsv` — delete it and grep
the folders if it ever looks wrong.

The counting rule changed on 2026-08-08 and the layout on 2026-08-09, so stored
counts are one or two too high. Both are corrected by exactly one run:

```powershell
.\archive-scan.ps1 -Mode Full -Force -Baseline -MigrateCast
```

**Telling the app who is in a set** — put one empty file per person into
`.pulseboard\`, named `Name (ICG-ID)`:

```
.pulseboard\Iveta_C_(IC-87VY)
.pulseboard\Anna Y (AY-006S)
```

The name is the whole statement — content is never read, any extension is fine, and
underscores, spaces and capitalisation make no difference. Knowing that one person is
in twelve sets is twelve pastes of one file; a second person in a set is a second
file, with nothing to merge. Markers only **add**: deleting one takes nothing back.
`-MigrateCast` converts an older `_cast.txt` into markers, once.

A `.pulseboard\` that Explorer draws **faded** carries the DOS hidden attribute —
Samba puts it on every dot-name, so a meta folder created from Linux, WSL or over the
share arrives hidden. The scan reads it with `-Force` and does not care, and neither
should you: the attribute is cosmetic, and clearing it is optional. (Before that fix
the walk died on the first hidden one with `Get-Item: Could not find item …
\.pulseboard`, because `Test-Path` sees hidden items and `Get-Item` does not.)

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

## `catalogue-join.ts` / `catalogue-join.mjs` — who is in the orphan folders (ADR-0027)

The only Node agent. Walks the catalogue's
`<Initial>/<Common_Name_(ICG-ID)>/_meta/{_Cover,_Videos}` tree, pulls the archive
side from the app, joins the two locally on exact date + title, and proposes people
for orphan folders.

Two ways to run it:

```powershell
# from a repo checkout, run from the repo ROOT
npx tsx scripts/catalogue-join.ts --catalogue "H:\Models\thenude" --cache catalogue.json

# as one copyable file, for a machine with no checkout
npm run build:agent        # → dist-agents/catalogue-join.mjs
node catalogue-join.mjs --catalogue "H:\Models\thenude" --cache catalogue.json
```

| Flag | |
|---|---|
| `--catalogue DIR` | Required (or `PERSON_CATALOGUE_ROOT`) |
| `--cache FILE` | **Use it.** The walk over 39k person folders takes ~30 minutes; every metric recomputes from the cache in seconds |
| `--rewalk` | Force a fresh walk even when the cache exists — see *When the cache is stale* below |
| `--limit N` | Cap the orphans fetched — a quick first look |
| `--examples N` | Example lines per section (default 8) |
| `--post` | **Write the suggestions back.** Without it the run only reports |
| `--post-batch N` | Suggestions per request (default 500) |
| `--base-url`, `--api-key`, `--tenant` | Default to the `ARCHIVE_*` env vars |

**When the cache is stale.** The cache holds one thing: the **person catalogue as parsed
from disk**. Nothing about the app or the archive is in it — the archive side is pulled
fresh from the app on every run. So the question is never "did I import something", it is
"did `H:\Models\thenude` itself change":

| What you did | `--rewalk`? |
|---|---|
| Imported a person **into Pulseboard** (uploaded a file) | **No** — the catalogue on disk is untouched by that |
| Added new sets to the **archive** | **No** — the archive side comes fresh from the app each run |
| **Updated or re-downloaded the catalogue** on disk | **Yes** — new person folders or new `_meta` covers are invisible until it is re-read |

The run says which it did: it prints how many set rows it read from the cache, or that it is
walking. Comparing `catalogue.json`'s timestamp with the catalogue tree's answers it too. A
needless rewalk is never *wrong*, only expensive — about 30 minutes over 39k person folders.

Report first, `--post` second. Even with `--post` nothing is materialised: the
suggestions are a queue an operator confirms in the workbench — never a set, a
participant or a contact.

**If a run seems to ignore `--post`, check you are running the current bundle.** An
old `catalogue-join.mjs` sitting next to the cache file silently lacked the flag;
the current one prints a WRITE-BACK banner when `--post` is active.

---

## When you have added new sets to the archive

```powershell
.\archive-scan.ps1 -Mode Full                                              # register them
.\archive-cover.ps1                                                        # thumbnails
node catalogue-join.mjs --catalogue "H:\Models\thenude" --cache catalogue.json          # read the report
node catalogue-join.mjs --catalogue "H:\Models\thenude" --cache catalogue.json --post   # then write it
.\catalogue-avatar.ps1                                                     # only if the join named faceless people
```

Then in the app: **Attribution queue → workbench**, then **Develop**.

Use `--cache` and **not** `--rewalk`: the cache holds the *catalogue* side, which has not
changed — only your archive grew, and the agent pulls that from the app each run. That turns a
30-minute walk into seconds.

Nothing else belongs in this sequence. `-Force` is for a file edited *inside* an unchanged
folder, `-Path` narrows a run and switches deletion detection off, `-Baseline` and
`-MigrateCast` were one-off migrations, `-SkipTargeted` is for the run right after moving
folders between roots, and `archive-rebake.ps1` has nothing to do with new sets.

One loop closes a round later: step 1 writes `.pulseboard\cast.json` only for folders the app
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
3. `node catalogue-join.mjs --catalogue … --cache catalogue.json` — report, read it,
   then re-run with `--post`.
4. `.\catalogue-avatar.ps1` — only when the join proposed people who have no face yet.
5. `.\archive-rebake.ps1` — or fold it into step 1 with `-Rebake`.

Then the work moves into the app: **Archive → Attribution queue** → workbench, and
`/archive/conflicts` for anything the app and your own claims disagree about.
