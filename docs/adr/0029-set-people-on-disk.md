# ADR-0029: Who is in a set, written on disk — a generated mirror and a hand-written inbox

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

The only place that knows who is in an archive set is the app. With the database,
MinIO or the Unraid host down, the archive on disk cannot answer the question that
matters most in exactly that situation — *in which sets did this person work?* Folder
names carry one alias at best and nothing at all for a multi-person set.

Three facts shaped the answer:

1. **The reverse direction was already decided.** ADR-0027 §6 defines the file (as
   `_people.txt`; renamed `_cast.txt` on 2026-08-09, see §4):
   one `Name (ICG-ID)` per line, hand-written, outranking catalogue and
   registry suggestions, deliberately a *separate* file from the app-written sidecar
   so neither side can overwrite the other. Never implemented.
2. **The forward direction existed in embryo and already went stale.**
   `_pulseboard.json` is written once; afterwards `archive-scan.ps1` only touches it
   when the folder *name* changes, patching it locally without asking the server. Its
   `setId` / `title` / `channel` are wrong the moment a link is confirmed later, and
   nothing says so.
3. **The app cannot write to the archive.** Only the scan agent can, so anything the
   app puts on disk arrives by *pull at scan time* — one scan run behind the truth.

## Decision

**The archive describes itself.** Each folder carries a small generated text file
naming the people the app knows, and may carry a hand-written one naming the people
*you* know. Neither is a backup: `scripts/db-backup.sh` restores the database and
restores far more than any sidecar could. What these files add is portability (a
copied folder keeps its people), lookup with no infrastructure at all, survival of a
*partial* loss, and a way to tell the app about people from the filesystem side.

### 1. The app writes its own file, in plain text

`_pulseboard_cast.txt`, next to `_pulseboard.json` rather than inside it. Two
reasons, both evidenced:

- The sidecar is the **identity anchor** — its `archiveKey` is what finds a folder
  again after a move. Every rewrite is an opportunity to damage it, and a people list
  is by nature rewritten often.
- PowerShell's `ConvertTo-Json` **collapses a one-element array into a scalar** (this
  project has been bitten already, fix 2e5f442). A participant list is precisely the
  shape that breaks when an agent rewrites JSON. Text has no such failure mode, and
  it greps, diffs and reads by eye.

Picasa's `.picasa.ini` is the counter-example that fixes the content: it referenced
people by hash into a central `contacts.xml`, so a folder copied elsewhere lost its
names. Every line here is therefore **self-contained** — `Name (ICG-ID)`, never an
internal id alone.

### 2. Both person sets go to disk, separately labelled

A folder carries **claims**; a set has a **cast** (ADR-0028), and linking places them
side by side rather than merging them. The file mirrors that exactly, with a
`# credited` section for the linked set's cast and a `# claimed` section for the
folder's attributions. A `grep` for an ICG-ID finds the folder either way; the labels
say how firm the statement is. Writing one merged list would reintroduce, one layer
down, the silent merge that ADR-0028 exists to prevent.

### 3. Freshness by revision hash, not by hope

The file header carries `# revision:` — the first 16 hex of a SHA-256 over a
canonical serialisation of both sections, the same convention `contentSignature`
already uses. Once per Full scan the agent fetches `archiveKey → revision` for every
folder, compares against the header on disk, and rewrites only what differs; the
sentinel `EMPTY` means "the app knows nobody" and the file is deleted. This is what
keeps the new file from repeating the sidecar's silent decay, and the same comparison
is the only honest way to tell a current file from an old one.

### 4. A hand-written line is a top-ranked suggestion, not a silent write

`_cast.txt` lands as an `ArchiveFolderSuggestion` with source `FOLDER_ATTRIBUTION`,
above catalogue and registry, needing no group vote — one keystroke in the workbench
confirms it. ADR-0027 calls the file an assertion, and it is; but a mistyped ICG-ID
usually points at a *real other person*, and this codebase has already shipped
polluted ICG-IDs once. One key is a cheap price for never attributing a stranger
without anyone looking. Malformed lines are reported, never silently dropped.

The hand-written file is `_cast.txt` (renamed from `_people.txt` on 2026-08-09; the older name
is still read). A name in it may use underscores or spaces, in any capitalisation —
`Iveta_C_(IC-87VY)`, `Iveta C (IC-87VY)` and `iveta c (IC-87VY)` are one person. That works
because the **ICG-ID is the identity** and the name is provenance; only the separators are
normalised, and the letters stay as typed, since deciding that `iveta c` should read `Iveta C`
is a guess a file has no business making.

### 5. The hand-written file only ever adds

Deleting a line means nothing. `ArchiveFolderAttribution` has no provenance column,
so an absent line cannot be told apart from "was never in the file", and an
unattended scan reading a truncated file would otherwise wipe confirmations made in
the workbench. Removal happens in the app. If hand-editing ever becomes a main
workflow, the upgrade path is a `source` column on the attribution.

### 6. Per-folder files are the truth; the index is convenience

The agent also writes `_pulseboard_index.tsv` per archive root — `ICG-ID`, name,
standing, relative path — so one file answers the whole question and can be copied
off. It is marked generated and derived: if it looks wrong, delete it and grep the
per-folder files, which cannot go stale independently of the folders they sit in.

## Consequences

- What the app confirms today appears on disk after the next Full scan. That latency
  is inherent: the app has no route to the archive filesystem.
- An *edited* `_cast.txt` is invisible to the leaf-mtime skip, because NTFS does not
  bump a directory's mtime when a file inside it changes. Picking it up needs
  `-Force` (with `-Path` to scope it) — the reason those switches exist.
- Per-image people (XMP, MWG face regions — the Lightroom/digiKam standard) are a
  different granularity and stay out: a set-level credits file cannot say who is on a
  given photo, and per-image sidecars cannot say which sets someone worked on. That
  is ADR-0023's territory.
- No schema change.

See also: ADR-0027 (the folder attribution outranks derived suggestions), ADR-0028
(claims and casts are not merged), ADR-0022 (unknown people become Contacts).
