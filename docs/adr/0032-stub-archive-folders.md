# ADR-0032: Stub archive folders — a placeholder copy, upgraded in place

- **Status:** Accepted
- **Date:** 2026-09-30


> **Amendment 2026-10-09:** the metadata folder `.pulseboard\` is now **`.pb\`** —
> short to type by hand. `archive-scan.ps1` renames any `.pulseboard\` it meets on a
> Full run (merging when both exist; differing files are left with a warning).
> Read `.pulseboard\` below as `.pb\`.

## Context

Some sets are filed in the archive on purpose as **stubs**: a handful of images, or
a low-quality copy, standing in until the real set is obtained. The app had no word
for this. The nearest concepts all mean something else:

- `Set.isComplete` describes the *set*, defaults to `false`, and therefore reads
  "unknown" far more often than "deliberately partial".
- `ArchiveStatus.INCOMPLETE` is derived by the scan (a video set whose video file is
  missing) — a fault, not an intention.
- The career stats count a CONFIRMED archive link as **Verified**, so a stub
  silently counts as "have".

What is partial is **the copy**, not the publication. The same set is complete at
the source; only the folder on disk falls short.

### How other tools handle it

- **Radarr / Sonarr** give every file a quality and a *cutoff*; everything below it
  is listed under **Cutoff Unmet**, and a better release is an **upgrade** of the
  same item — identity kept, file replaced.
- **Lightroom / darktable** keep the catalogue authoritative and mirror it into a
  sidecar beside the image. Both sides may change; the tool remembers what was last
  synchronised, so it can tell *which* side moved, and reports a conflict when both
  did.
- **OCFL** keeps an object's identity across versions of its content.

## Decision

### 1. The flag is on the `ArchiveFolder`

`stubSince` (set = this folder is a stub), `stubReason` (`FEW_MEDIA`,
`LOW_QUALITY`, `BOTH`) and an optional `stubNote`. A Set or StagingSet shows it
through its link; a folder linked to nothing can be a stub too. `isComplete` is
untouched — it keeps meaning what it meant.

### 2. On disk: `.pulseboard\STUB`

An empty file, the same gesture as a cast marker (ADR-0030 §2): drop it in while
filing the folder. Any extension is tolerated (Explorer's "New → Text Document"
appends `.txt`). Text inside it becomes the note. It can never be mistaken for a
cast marker — it carries no ICG-ID in brackets.

### 3. Either side may set or end it — three-way reconciliation

The app stores what the disk said at the last reconciliation (`stubDiskState`).
Comparing the current disk state, that remembered state and the app's flag tells
which side changed:

| disk now vs. last seen | app vs. last seen | result |
|---|---|---|
| same | same | nothing |
| changed | same | the app adopts the disk |
| same | changed | the agent writes / removes `STUB` |
| changed | changed | nothing — both moved away from the same value, so they agree |

The flag is a boolean, so there is no conflict case: two sides that each changed
from the same remembered value hold the same value. Before the scan has reported a
folder at all (`stubDiskState` null) the two are united — a stub on either side is a
stub. The note is carried along when the flag is set, not reconciled on its own.

Removing `STUB` after an end in the app is the **only** write the agent makes for
this feature; `pulseboard.json`, `cast.json` and the cast markers are never touched.

### 4. An upgrade happens in place; a content change is not a signal

The operator replaces the **media** inside the same folder and leaves
`.pulseboard\` alone, so the `archiveKey`, the cast markers and the link all
survive — an OCFL-style new version of the same object. A replacing folder
elsewhere is **not** supported.

A content change on a stub folder is treated exactly like one on any other folder
(`CHANGED` as usual). Media are also swapped in a stub that stays a stub, so no
content change may end one or prompt about it. A stub ends only by an explicit act:
deleting `STUB` on disk, or **End stub** in the app.

### 5. The scan lists stub folders in full, every run

NTFS bumps a directory's mtime only when an entry is added, removed or renamed.
Media overwritten under the same names — 12 small images replaced by 12 large ones —
leave the folder looking untouched, and the leaf-mtime skip would hide the upgrade
for ever (the trap of ADR-0030 §4). A folder carrying `STUB` is never skipped; there
are few of them.

### 6. Ending a stub has the same consequences whichever side ends it

The folder cover is reset so the cover agent rebuilds it from the real media, and
the app offers to re-import the set's media and re-bake its aligned images.

### 7. Stubs are counted apart

A set whose archive copy is a stub is not **Verified** in the career stats; it has
its own column. `/archive` gets a **Stubs** view — the Cutoff Unmet list.

## Consequences

- One migration (`archive_folder`: `stubSince`, `stubReason`, `stubNote`,
  `stubDiskState`, `stubEndedAt`), applied to every tenant.
- `archive-scan.ps1` reports `STUB` (presence + text) and writes/removes it on
  request (`GET /api/archive/stub-writes`);
  the TypeScript scanner does not handle `.pulseboard\` and is unaffected.
- The reconciliation is a pure function, unit-tested over all four cases.

See also: ADR-0030 (`.pulseboard\` and markers), ADR-0017 (HD re-bake).
