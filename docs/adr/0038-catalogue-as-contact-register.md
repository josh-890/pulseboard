# ADR-0038: The person catalogue becomes the Contact register

- **Status:** Accepted 2026-10-28 — go, after the read-only inventory (see "The inventory's verdict")
- **Date:** 2026-10-28
- **Relates to:** ADR-0009 (re-import review), ADR-0022 (Contact register), ADR-0026 (ICG-IDs),
  ADR-0027 (archive ↔ catalogue join)
- **Supersedes in part:** ADR-0027 §1 ("never ingested wholesale") and its rejected alternative
  "bulk-importing the person catalogue" — identities and a compact set table are loaded; career
  facts still materialise only on confirmation (ADR-0027 §4 stands)

## Context

The person catalogue (`<PERSON_CATALOGUE_ROOT>\<Initial>\<Name_(ICG-ID)>\_meta\`, about 39,100 folders,
xpulse) holds an import file, a portrait and set covers for each person. Import is one file at a time and
a full import is heavy: Person, aliases, links, baseline values, a staging set for every set, contacts and
credits. Most of these people will never matter; the Persons already developed matter a great deal and
must never get a conflict from a bulk run.

The main driver: **when a set is promoted, everyone in its cast is already known.** Welcome side effects:
archive folders become attributable (ADR-0027: 74 % of orphan folders name people the app does not know),
anyone can be looked up, the network fills in, and the long tail is a pool to pick from.

## Decision

1. **A catalogue person is a Contact.** One register of known-but-not-developed people. "Known" means a
   recognisable identity: ICG-ID, name, face, aliases per channel. Developing one turns the Contact into a
   Person through the existing full import of their newest catalogue file (usual review); links, portrait
   and notes carry over.
2. **Every existing Person is precious.** A catalogue run never writes to a Person. A newer file for one
   shows as a hint only ("newer catalogue file: 12 new sets, 2 changed values"); opening it starts the
   ADR-0009 review.
3. **Evidence, not truth.** Catalogue data is a dated source. It fills Contacts and suggests links, never
   overrides what the user entered or confirmed; contradictions are shown and the user's data wins.
4. **Set lists are reference knowledge in a table of their own**, one row per catalogue set (date, channel,
   title, CoverId, video or not, cast as ICG-IDs) — not rows on the Contact. The app matches new archive
   folders against it right after an archive scan, with no extra agent run, and shows any catalogue
   person's sets. Only the archive matcher and that view read it; people pages, lists, search and pickers
   never do. A set becomes a staging set only when a person or set is worked on.
5. **Images:** the portrait now, set covers on demand. A portrait is easy to swap on any Contact; a chosen
   portrait sticks (no run replaces it) and becomes the headshot when the Contact becomes a Person.
6. **Linking:** an exact ICG-ID link is made automatically; anything inferred from names or aliases is a
   suggestion decided per item.
7. **Visibility:** People lists, dashboards and filters stay Persons-only. Contacts appear in global search
   (their own group, below Persons), cast pickers, archive attribution, co-model links and the Contacts
   register. Ignored Contacts stay ignored but are still enriched.
8. **Errors are isolated, never silent.** A bad file or image fails only itself, with reason and location,
   listed and retryable alone. A valid identity with broken parts is taken and the parts flagged. No valid
   ICG-ID, or folder-name ICG-ID ≠ file ICG-ID → quarantine, no Contact.
9. **Several file versions:** the newest wins; older ones fill gaps (sets and aliases are the union, marked
   "only in older file").
10. **Safe to re-run, reversible per run.** Everything a run brings is tagged with source and run and can be
    removed without touching user work (chosen portraits, notes, confirmed links, Contacts that existed
    before). A prod backup precedes every real run.
11. **Nothing is written before a read-only inventory** over all folders gives the numbers for go/no-go.

## The inventory (agreed 2026-10-28)

A read-only Node agent on the Windows box (`scripts/catalogue-inventory.ts`, see docs/agents.md) runs the app's own parser over every catalogue folder (so
"clean" in the report means clean in the app) and compares against the app through the x-archive-key API.
It writes nothing to the app; its result is an Excel workbook: a Summary sheet and one sheet per problem
kind, which later serves as the fix-list.

- **Measures:** data health; overlap (already a Person → hint, a Contact → enriched, ignored, new);
  payoff for set promotion (unknown cast members of staged sets that become known); payoff for archive
  and network (orphan folders and co-model mentions that get a name); projected cost (rows, DB growth,
  portrait storage).
- **Problem kinds.** Quarantine (no Contact): Q1 no import file, Q2 unreadable, Q3 no or malformed
  ICG-ID, Q4 folder ICG-ID ≠ file ICG-ID, Q5 same ICG-ID in several folders. Flag (identity taken, part
  marked): F1 polluted header, F2 section cut off or empty, F3 mangled name, F4 portrait missing,
  undecodable or ambiguous, F5 undecodable cover, F6 an older version holds more. Info: I1 is a Person,
  I2 is a Contact, I3 is an ignored Contact, I4 new.
- **Images:** every portrait fully decoded — by the app, which already holds the strict verdict for each
  portrait `catalogue-avatar.ps1` sent; covers counted and a stable ~5 % sampled (full decode where
  `sharp` is available, structure check otherwise — the report says which).
- **No-go:** about 10 % or more quarantined (fix the scrapes first), or cost too high. "Fast" means
  nothing gets slower: pages without Contacts as fast as before, search and cast pickers with all
  Contacts about as fast as now (well under half a second), proven on a full-size dev copy before prod.
  Portraits stay small (~256 px, about 1 GB in all); the DB ceiling is set when the projection is seen.

## The inventory's verdict (2026-10-28, xpulse)

- **Health:** 39,104 folders — 98.0 % clean, 1.9 % partial, **0.1 % quarantined** (49: Q1 5, Q3 40, Q5 4).
  Flags: F1 625, F2 85, F4 28, F5 3 of a 56,588-cover sample; F3 and F6 none.
- **Overlap:** 203 Persons (hint only), 1,796 Contacts (enriched), 37,056 new.
- **Set promotion — the main driver:** of 38,681 open staged sets, 5,947 wait on a cast member who is not a
  developed Person. Those are 1,763 people, already thin Contacts (made by the import for every co-model);
  1,758 are in the catalogue (1,757 with a portrait), so **5,903 sets (99.3 %) get a recognisable cast**.
  44 stay blocked by 5 people (JH-851K alone 31 sets; SB-00UP has no import file).
- **Why all identities and not just those 1,800:** every person developed later brings new co-models;
  enriching on demand would need the app to read `H:\`, i.e. an agent run after each import. With every
  identity loaded, a new co-model is recognisable at once; a run is needed only when the catalogue changes.
- **Why all sets:** archive folders keep arriving; matching them in the app needs the full list, since which
  set turns up next is unknown. Stored once per set (~950k rows, not 1.09 M per-person rows), estimated
  100–150 MB on top of ≈ 75 MB for identities and aliases (DB today 549 MB); portraits are already stored.
- **Still to prove before prod:** the real size and the speed (search and cast pickers with ~39k Contacts
  well under half a second, nothing else slower) on a full-size dev copy. Far above 150 MB → decide again.

## Design (agreed 2026-10-28)

**What a Contact holds.** Identity and lookup aids from the person's own file: ICG-ID, name, AKA names,
aliases per channel, birth year, nationality (IOC), the file's source date; the face is the catalogue
portrait. Measurements, colours, biography and links stay in the file and come with developing. The
catalogue fields are read-only — corrections come with developing or by fixing the file. Yours on a
Contact: the name (once you set it, it sticks; a Contact you created yourself counts as named by you), the
portrait (sticks), the note and Ignore. The own file decides the name; how other people's files list her
becomes AKA evidence and no longer renames her. On develop your name wins in the review; the file's name
stays as an alias.

**The catalogue set table and matching.** One row per CoverId; the cast is the union over every file
listing the set; title, date and channel come from the newest file; disagreements are flagged on the row
and the matcher tries every recorded date; undated sets are kept, never matched. The app takes over
`catalogue-join` (same rules, same suggestion queue and workbench; the agent is retired) and matches after
every archive scan (new folders) and after every catalogue run (all unmatched orphans); a confirmed or
rejected suggestion is never reopened. When a Contact becomes a Person, every set credited to her by
ICG-ID joins her career by itself (session contribution and set participation, role from the credit) —
today `reconcileContacts` only repoints the credit; name-only credits stay open.

**The load run.** A "Catalogue runs" page holds each run's counts, the current problem list and Undo.
Undo works from the latest run back; it restores the catalogue data as it was before the run and never
touches your work (a Contact you used keeps existing, only its catalogue fields revert; confirmed
suggestions stay, unconfirmed ones from the run are withdrawn). After the first load only changes are sent
(new folders, newer files, fixed quarantine); a folder gone from `H:\` is never deleted, its Contact is
marked "no longer in the catalogue". The first load requires a fresh prod backup; later runs rely on Undo.
Every run also sends each folder's newest import file, kept compressed in MinIO (~120 MB), so Develop and
the hint on a Person ("newer file: 12 new sets, 2 changed values → Review", ADR-0009) need no upload.

**Automatic from then on.** The agent runs every 15 minutes as a Windows scheduled task: it sends
catalogue changes and delivers covers the app asked for (on Develop, or a staged set opened without a
cover — "covers on the way"). An empty pass leaves no run entry. After the first load no manual run is
needed.

**What you see.** A light Contact page (face with Change portrait, name with Rename, ICG-ID, birth year,
nationality, file date; Develop, Link…, Ignore; known as; catalogue sets marked in archive / in app /
catalogue only, sets credited to her; archive folders; note) — plainer than a Person page. Everywhere:
`Name (ICG-ID)`, a "Contact" label and lighter frame, Persons first, lookup aids in the line
(`Sunny (SX-0036) · UKR · 1998`).

**Channels.** Import files name channels; the link to an app channel is the **import alias**, made by
hand and deliberately (Label if needed, Channel with name, Shortname and Archive folder) — getting it
wrong is chaos. So the catalogue links a channel name **only through an import alias**: never by name,
never fuzzy. An unlinked name stays a name ("on `TEAM SKEET` — channel not linked"); creating or linking
the channel connects every catalogue alias and set with that name at once, removing the import alias
disconnects them. Measured on prod (2026-10-28): 537 channels, 0 sets, 0 archived sets and 0 open staged
sets without a channel; 417 of 1,291 catalogue names linked (77 % of alias rows); 60 names linked by the
import's exact-name match only (`METART` → MetArt, 3,097 staged sets); 20 archive channel folders (458
folders) no channel claims as its Archive folder. A **Channel check** page comes first, before any load:
archive folders no channel claims (hint by Shortname or name → set as Archive folder / create channel),
names linked by name only (→ add as import alias), later the unlinked catalogue names ranked by what
hangs on them (archive, waiting staged sets) — every item decided on its own, showing what it connects;
the page also re-checks that no archived or staged set is without a channel.

**S4 (2026-10-29).** The section *Catalogue channels* lists every unlinked catalogue name, spellings that
differ only in case or spaces as one row (one import alias links them all), with what linking connects
(orphan archive folders the catalogue matched on that channel, waiting staged sets, Contacts, catalogue
sets, years). Waiting first by default, A–Z to see related names together; hints: the channel owning the
matched archive folders, then same name, then Shortname. A waiting staged-set name the catalogue also
writes is listed only there. After the full load (2026-10-29): 39,104 folders, 49 quarantined, 736
flagged, 984,755 catalogue sets.

**Malformed ICG-IDs.** The 40 Q3 folders stay in quarantine and `ICG_ID_RE` is not widened; they are
fixed by hand (folder name, file name and the file's ICGID line must agree), and the next pass picks
them up.

## Known flaws in the data

Incomplete or broken scrapes (HTML junk, encoding), several file versions per folder, missing or wrong
portraits, corrupt cover images, special characters in names that broke the scrape (no valid ICG-ID).
Measured: 2 ICG-IDs in two folders each (JA-86IQ, MX-003I). The 40 Q3 IDs follow a few regular patterns
(a digit or symbol from the name in the prefix, lowercase, a second dash, short) plus 3 `NO_ICGID`; few
enough to fix by hand.

## Open

- How the agent learns that a fresh prod backup exists (`db-backup.sh` runs from WSL today).
- ~~Size and speed are proven on a full-size dev copy before the first load.~~ **Passed (S1,
  2026-10-28)** on a copy of xpulse filled with the real 39,057 identities and 223k channel
  aliases and 985k sets (real CoverIds and casts, synthetic titles/dates; `scripts/catalogue-proof.ts`):
  - **Space:** +218 MB (449 → 668 MB): Contacts 20 MB, aliases 41 MB, sets 159 MB — within the
    agreed ≲ 225 MB. The alias table uses its natural key as primary key (no surrogate id), −16 MB.
  - **Nothing slower:** dashboard, /people, person page, /sets, set page, /staging-sets and the
    person picker unchanged within run-to-run noise (2–70 ms medians, repeated runs).
  - **Where Contacts appear:** S2's contact search ~5 ms per query (trigram on `searchNorm`);
    the register's current name search 14 → 49 ms (switches to `searchNorm` in S2); unlocking head
    46 → 52 ms. All far under 0.5 s.
  - **Matching:** archive match ~2 ms per folder (sets on the date ± 1 day); "her sets" ~1.4 ms.
