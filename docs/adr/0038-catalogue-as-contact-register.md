# ADR-0038: The person catalogue becomes the Contact register

- **Status:** Proposed — goals agreed 2026-10-28; becomes Accepted after the read-only inventory's go/no-go
- **Date:** 2026-10-28
- **Relates to:** ADR-0009 (re-import review), ADR-0022 (Contact register), ADR-0026 (ICG-IDs),
  ADR-0027 (archive ↔ catalogue join)

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
4. **Set lists are reference knowledge** on the Contact (title, channel, date, CoverId, co-cast), used for
   matching and "appears in N sets". They become staging sets only when a person or set is worked on.
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

## Known flaws in the data

Incomplete or broken scrapes (HTML junk, encoding), several file versions per folder, missing or wrong
portraits, corrupt cover images, special characters in names that broke the scrape (no valid ICG-ID).
Duplicate folders for one person are unmeasured.

## Open

- The prod app (Docker on Unraid) cannot read `H:\`; reading files and covers on demand needs a way in.
- Catalogue evidence on a Contact must stay distinguishable from the user's own data.
- One-time load or recurring sync is undecided.
