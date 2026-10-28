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

## Known flaws in the data

Incomplete or broken scrapes (HTML junk, encoding), several file versions per folder, missing or wrong
portraits, corrupt cover images, special characters in names that broke the scrape (no valid ICG-ID).
Measured: 2 ICG-IDs in two folders each (JA-86IQ, MX-003I). Some Q3 IDs may be real ones `ICG_ID_RE` is
too strict for (`A2-00XO`, `B2-00HFT`, `C2-00VIQ` — a digit in the second position): to check.

## Open

- The prod app (Docker on Unraid) cannot read `H:\`; reading files and covers on demand needs a way in.
- Catalogue evidence on a Contact must stay distinguishable from the user's own data.
- One-time load or recurring sync is undecided.
