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
refreshes `_pulseboard_people.txt` and the per-root index.

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
| `-Path <dir>` | Restrict the walk to a channel folder, a year, or a single leaf — a full path under one of the three roots, not a channel name. Use it with `-Force` to keep a forced run quick |
| `-Force` | Re-read every leaf, ignoring the mtime shortcut. **Needed after editing a file inside a folder** — see the trap below |
| `-NoSidecarPrompt` | Do not ask before writing `_pulseboard.json`; for scheduled runs |
| `-SkipPeople` | Skip `_pulseboard_people.txt` and the index |
| `-Rebake` / `-RebakeForce` | Run `archive-rebake.ps1` afterwards, on paths this scan just verified |
| `-BatchSize` | Folders per POST (default 200) |
| `-DryRun` | Report only |

**The trap that costs the most time:** NTFS does *not* update a folder's timestamp
when a file **inside** it changes — only when an entry is added, removed or renamed.
So an edited `_people.txt` is invisible to the mtime shortcut and a plain Full scan
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
| `--rewalk` | Force a fresh walk even when the cache exists |
| `--limit N` | Cap the orphans fetched — a quick first look |
| `--examples N` | Example lines per section (default 8) |
| `--post` | **Write the suggestions back.** Without it the run only reports |
| `--post-batch N` | Suggestions per request (default 500) |
| `--base-url`, `--api-key`, `--tenant` | Default to the `ARCHIVE_*` env vars |

Report first, `--post` second. Even with `--post` nothing is materialised: the
suggestions are a queue an operator confirms in the workbench — never a set, a
participant or a contact.

**If a run seems to ignore `--post`, check you are running the current bundle.** An
old `catalogue-join.mjs` sitting next to the cache file silently lacked the flag;
the current one prints a WRITE-BACK banner when `--post` is active.

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
