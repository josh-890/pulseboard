# ADR-0030: Metadata out of the media plane — `.pulseboard\` and cast markers

- **Status:** Accepted
- **Date:** 2026-08-09
- **Supersedes:** the file names and the authoring format of ADR-0029 §1 and §4

## Context

The archive exists to hold media and to be backed up. A set folder should contain a
set — images, or a video plus `frames\`. Instead, tool metadata had been collecting
in that same plane: `_pulseboard.json`, `_pulseboard_cast.txt`, `_cast.txt`, and
`.media-date-plan.json` from a tool outside this repo.

That is not tidiness. It cost real damage twice in one week: the file count and the
content signature took *every* file in the folder, so the first cast files added one
file to 276 sets and the app read its own write as damage (`CHANGED`). A media-only
whitelist fixed the symptom. The cause is that tooling and payload share one
namespace, so every new metadata kind re-opens the same question.

**BagIt** (RFC 8493) and **OCFL** — the standards for a payload whose presence and
fixity must be provable — both answer the same way: the payload lives in its own
directory and metadata sits beside it, separated **by a directory, not by a naming
convention**. Their literal shape (`data/` plus manifests) is unreachable here; it
would rewrite 34,668 paths in the database and in every backup tier.

The second problem was authoring. A hand-written line file made the common case
expensive: knowing one person is in twelve sets meant creating or editing twelve
files, and a set with several people could not be handled by copying a file at all.

## Decision

### 1. One metadata directory per set folder

Everything tool-written moves into `.pulseboard\` inside the set folder:

```
2011-01-16-MPL Talia - The Delicate Edge\
    …the images…
    .pulseboard\
        pulseboard.json        identity anchor (archiveKey)
        cast.json              generated: who the app knows is in this set
        Iveta_C_(IC-87VY)      a marker — a claim of yours
```

This is the achievable inverse of BagIt: the payload stays put and the metadata gets
a container. One exclude rule (`.pulseboard\`) then covers backup, dedup and
verification — including metadata kinds that do not exist yet — where the previous
arrangement needed a pattern list that grew with every addition and was twice
incomplete. Copying a folder still carries everything, which is what ADR-0029
required and what Picasa's central `contacts.xml` failed at.

The **identity anchor moves too**. Its `archiveKey` is what recognises a folder that
was moved to another drive, so this is the riskiest part: it now depends on every
tool that ever copies a folder taking dot-directories along (Explorer, robocopy and
rsync do). The agent reads the old location as well, so nothing loses its identity
mid-migration, and a folder that arrives without an anchor is still recovered by its
content signature — which the media-only rule made *more* stable, not less.

No hidden attribute is set. It is a folder you paste into.

### 2. Manual claims are marker files, not lines

One empty file per person, in `.pulseboard\`, named `Name (ICG-ID)`. **Files
compose; lines do not** — adding a second person to a folder that already has one is
the same gesture as the first, and one person across twelve sets is twelve pastes of
one file. The name format is the one the person catalogue already uses for its own
folders, so a marker can be copied straight out of it.

The name is the whole statement: content is never read, and any extension is
tolerated because Explorer's "New → Text Document" appends `.txt` and dropping a
claim over that would be silent loss. `Iveta_C_(IC-87VY)`, `Iveta C (IC-87VY)` and
`iveta c (ic-87vy)` are one person — the ICG-ID identifies, the name is provenance.
Our own files can never be mistaken for markers: they carry no ICG-ID in brackets.

Markers remain **additive** (ADR-0029 §5): deleting one takes nothing back. The
line-based file is no longer read; `-MigrateCast` converts an existing one into
markers once and removes it.

### 3. The generated file is JSON

ADR-0029 §1 argued for plain text partly because PowerShell's `ConvertTo-Json`
collapses a one-element array. **That reasoning was wrong for this file**: the agent
never serialises it — the app renders it and the agent writes the body verbatim. The
collapse hazard belongs to the ingest payload, which `coerceFolderPeople` guards.
With authoring moved to markers the file is machine-written and machine-read only, so
the other argument for text — hand-editing — is gone as well.

`cast.json` gives one format beside `pulseboard.json`, `JSON.parse` instead of a
comment grammar maintained in two languages, and room for further fields without
inventing syntax. `revision` stays the **first key**: the agent compares 34k folders
per scan by reading the first lines of each file, and only the folders that have one
are parsed in full.

`pulseboard.json` and `cast.json` stay two files. The reason from ADR-0029 is
format-independent: the anchor is written once, the cast is rewritten constantly, and
every rewrite is a chance to damage the `archiveKey`.

### 4. The scan reports the later of two timestamps

NTFS bumps a directory's mtime only when an entry is added, removed or renamed *in
it*. A marker dropped into an existing `.pulseboard\` therefore leaves the set folder
looking untouched, and the leaf-mtime skip would hide it **for ever** — for every
folder after the first marker, in every folder the app has already visited. The agent
now reports `max(leaf, .pulseboard\)` as the leaf's mtime, so anything appearing in
there makes the folder readable again on the next run. No schema change: the stored
value simply becomes the later one.

## Consequences

- One-time migration, folded into the run already owed after the root balancing:
  `-Mode Full -Force -Baseline -MigrateCast`. Creating `.pulseboard\` bumps every
  leaf's mtime once; no media file is touched, so **no content signature changes**.
- `.media-date-plan.json` is written by a tool outside this repo and stays where it
  is. `.pulseboard\` is named for its owner — another tool's metadata is not ours to
  host, and a neutral name would only blur who may delete what.
- A checksum manifest per folder (the other half of what BagIt gives) is now cheap to
  add later: it has a place to live.

See also: ADR-0029 (why the archive describes itself at all), ADR-0027 (a folder
attribution outranks derived suggestions), ADR-0028 (claims and casts are not merged).
