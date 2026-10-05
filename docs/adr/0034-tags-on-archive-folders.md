# ADR-0034: Tags on archive folders — tag at filing time, synced with the app

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Tagging (ADR-0033) lived entirely inside the app. But almost all material lives
outside `Set` — on xpulse, 2026-10-05: 53 965 archive folders, 683 of them linked to a
Set, 7 532 to a staged set only, 45 750 to nothing. The moment the user *knows* a
set's tags is when filing it in Explorer, with its content in front of them and the
app closed. Many of those sets are promoted much later, or never.

### How other tools handle it

- **Lightroom / digiKam** write keywords into XMP sidecars and read them back; both
  sides may change, and a remembered last-synchronised state tells which side moved.
- **Kodi / Jellyfin** read `.nfo` files lying next to the media — metadata travels
  with the files and is authored without the app.
- **Hydrus** imports sidecar tag files; **Stash** tags scanned objects before they
  are matched to anything curated.
- **Lightroom** "keywords on import" — the tags are given at the moment of filing
  and carried onto the catalogue item.

Common ground: tag the object you have *now*, keep the tags beside the files, sync
both ways against a remembered state, carry them forward when the object is promoted.

## Decision

1. **On disk, one empty file per tag** in the folder's `.pulseboard\`: `#outdoor`,
   `#outfit=bikini`. The same gesture as cast markers (ADR-0029/0030). `=` qualifies
   a name two groups share (`:` is illegal in Windows names). Any short extension is
   tolerated, case is ignored, `_` reads as a space; the name, slug or an alias of a
   tag are all accepted.
2. **Two-way sync per tag**, exactly the ADR-0032 `STUB` rule applied to each tag's
   presence against `ArchiveFolder.tagsDiskState` (what the disk carried at the last
   reconcile). Disk changed → the app follows; app changed → the disk follows; never
   reported → both sides are united, nothing is removed.
3. **The tags live on the archive folder** (`ArchiveFolderTag`) until a CONFIRMED
   link joins the folder to a **Set**; from then on they are the Set's `SetTag`s and
   the disk follows the Set. One truth at a time. A staged set shows and edits the
   tags of its linked folder; one without a folder carries none.
4. **Ownership heals itself** instead of being wired into the ~20 link mutation sites:
   wherever a folder is read for tags (scan reconcile, the list rows, promotion)
   rows still on a set-linked folder move to the Set (`absorbFolderTagsIntoSets`).
   `ArchiveFolder.tagsSyncedOwner` records whose tags the disk state was compared
   with; when the owner changed (unlink, set deleted) the next reconcile **unites**
   rather than deleting markers.
5. **Unknown names** from disk are kept per folder (`tagMarkersUnknown`) and shown as
   suggestions; the user says which tag the name means (an alias is added unless it
   is the tag's own name) or creates it — then every folder carrying it adopts it.
   Unknown markers are never deleted by the write phase.
6. **Two markers of one exclusive group** (`#indoor` + `#outdoor`): nothing is adopted
   for that group and the folder shows a warning (`tagMarkersConflicts`) — never a
   guess. The group's remembered disk state is kept as it was.
7. Only CONTENT/ANY-domain tags go on folders; any other name is "unknown".

### The agent

`archive-scan.ps1` reports `tagMarkers` (always an array, so absence is a statement)
on Full runs, and excludes `#…` files from cast-marker parsing. A new write phase,
`Write-TagMarkers`, after the stub markers, fetches `GET /api/archive/tag-writes` and
makes the `#…` files of each listed folder match `want` exactly — canonical names for
the owner's tags plus the unknown and conflicting markers unchanged. It touches no
other file. Writes are only issued for folders the scan has reported at least once
under the current owner.

## Consequences

- Tags can be given at filing time, months before a set is promoted, and survive
  promotion without retyping.
- The filter, bulk tagging, workbench `T` and the To-do inbox for folders are a
  second stage (they reuse the ADR-0033 machinery with `ARCHIVE_FOLDER`).
- **Renames never strip tags.** Marker files carry names, so a rename must not make
  the sync read "file gone, tag deleted". Three rules (2026-10-05, after the hole was
  found before first use):
  1. Renaming a tag keeps its old name as an alias (`updateTagDefinition`), so
     `#OldName` files — and saved queries — still mean it. The files keep the old
     name; nothing is rewritten on disk.
  2. The group part of `#group=name` only disambiguates: if it names no group any
     more (the group was renamed) and the name alone is unambiguous, the name decides.
  3. While a folder holds markers the app cannot place, no tag is removed from it
     because its marker is "missing" (`holdDiskRemovals`) — the unknown marker may be
     that tag under a name the catalogue no longer knows. Removal from disk takes
     effect once the unknown markers are resolved. App-side removals still sync.
