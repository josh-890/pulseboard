# ADR-0036: Intensity replaces Disclosure — scenarios × acts, extras, per person per session

- **Status:** Accepted
- **Date:** 2026-10-21
- **Supersedes:** ADR-0035 (its context — why Skills goes, how other tools handle it — still holds)

## Context

ADR-0035 replaced "Skills" with *Disclosure*: per situation a ladder of levels, the score a level's share of
its ladder, the setting recorded but not yet weighed. Only the catalog shipped (slice 1); no entry was ever made.

Thinking it through, the user changed the meaning. What they record is a **mental intensity level**: how intense
it is for a person to do a given act in a given scenario. That is a value *they assign*, not a position on a
ladder — and circumstances (public, first time) raise it by known amounts. "Disclosure" also already means
*progressive disclosure* in our UX docs.

## Decision

1. **Words.** *Intensity* is the topic and the person tab. Columns are **scenarios** (Solo · G-G · G-B · Group ·
   Special, ordered — Glamour was merged into Solo on 2026-10-23, see the amendment below). A cell is an **act** with an **intensity level**. A surcharge is an **extra**.
   Rejected: "activity" (the `Activity` feed), "modifier" (date modifiers), "mod" (body mods), "special" (a
   scenario), "factor" (it adds, not multiplies), "situation", "step".
2. **Catalog.** Each scenario has its **own list of acts**, each with its own level — no shared rows across
   columns. Levels and points in **0.5 steps**. Edited in Settings, per tenant, as a matrix: rows are values,
   the first column the **scale** — what each value means, in the user's words — and every act sits on the row
   of its level.
3. **Extras** are global and carry **fixed points** from the catalog — only additions; changing a catalog value
   re-rates every session. Extras may sit in an **extra group**, of which at most one applies (Location:
   Private +0 · Secluded outdoors +0.5 · Semi-public +1 · Public +2). "First time" is an extra ticked by hand,
   not computed.
4. **Cap and Max.** An act's value never exceeds **9.5**. One special extra, **Max** (renamable, never deleted),
   sets the value to **10** whatever the sum. Set for a person in a session (not just one act), it makes that
   session 10 even before any act is ticked (2026-10-21).
5. **Assignment at the session**, per on-camera person (on the `SessionContribution`, by foreign key — merge
   moves it, delete removes it): extras set once for the person in that session; acts ticked by checkbox; each
   act **inherits** those extras and may **add** one (a grouped one replaces the inherited choice in its group)
   or **drop** one. The scenario suggested from the cast is offered first; the others stay reachable.
6. **Values are computed, never stored**: act value = Max ? 10 : min(9.5, level + Σ points); session intensity =
   the person's highest act there; **peak intensity** = their highest overall and per scenario. Peak replaces
   CP/WCP; `Person.pgrade` stays. ADR-0035's scenario weights and settings-as-entries go.
7. **Real skills become person tags** (unchanged from ADR-0035).
8. **Person tab (grilled 2026-10-21).** Top: peak overall and per scenario. Then the catalog as a matrix — acts
   on the row of their level, reached ones filled with the first date and the number of sessions. Then the
   course, session by session, first times starred. Undated sessions come last, marked; an act reached only in
   undated sessions has "date unknown"; partial dates show their precision. The person header's CP/WCP row
   becomes **Intensity**: peak, bar, and a dot for the mean session intensity (as WCP's dot was).
9. **Photos as evidence (slice 3b).** A photo is linked to a **ticked act of one person in a session**
   (`ContributionAct`) — the person is exact and there is no evidence without a tick. It behaves like a tag: a
   lightbox pill, "assign to act…" for a gallery selection, a picker from the panel, and an `act:` filter in the
   shared query. Acts do not become tags: a second, person-less store of the same fact would drift from the
   ticks. Purpose: evidence on the act, gallery filtering, a showcase per act on the person page.

## Consequences

- The disclosure tables are converted in place (situations → scenarios, levels → acts with proposed levels,
  settings → the Location group) and dropped; "First time" and Max are seeded.
- Ticking happens on sessions (slice 2), the person tab and peak follow (slice 3), photos as evidence (3b:
  `ContributionActMedia`, cascading with the tick and the photo; a photo split to another session drops its
  links; a session merge carries them to the act that stays), filters (4: `intensity>=N` and
  `intensity:scenario>=N` in the shared query, computed in SQL by the same rules as `src/lib/intensity.ts`; an
  Intensity facet on /people (peak), /sessions and /sets), and retiring Skills (5, 2026-10-22: pulse's
  person skills became "Person traits" tags — acting, stunts, fitness; xpulse's Solo skills were not mapped to
  acts and nothing there was carried over; then the Skill tables, enums, tab, catalog page, session section,
  `/api/skill-events` and the skill-level settings were removed). `Person.pgrade` stays.

## Amendment 2026-10-23 — Glamour merged into Solo

Splitting "classic modelling, no action of one's own" (Glamour) from "action of one's own" (Solo) made no sense in
practice: both are one person alone, and the line between them is the act, not the constellation. Migration
`20261023090000_merge_glamour_into_solo` moves Glamour's acts to Solo with their ids (ticks, photo evidence and extras
stay); an act whose name Solo already has, ignoring case, joins that act. A person alone is now suggested Solo only.


## Amendment 2026-10-23 — catalog edits that reach the rest of the system (K0)

The catalog will be reworked over many iterations (plan: catalog as a board — K0 integrity, K1 drag, K2 side-peek,
K3 bulk, K4 overview; then merge/replace/archive; then impact preview and a change log with undo). First the two
places where an edit silently broke something: moving an extra into a group is refused while sessions hold it beside
another extra of that group (both would count), and renaming an act or a scenario rewrites the saved filters and
Smart Collections that name it (`act:`, `intensity:Scenario…`) in the same transaction.

## Amendment 2026-10-23 — the catalog is a board (K1)

The matrix is a Kanban board with sub-grouping (as in Linear or GitHub Projects): scenarios are columns, intensity
levels are horizontal lanes across all of them, acts are cards. A card dragged into any cell takes that scenario and
level at once; within a cell the order is manual (`IntensityAct.sortOrder`, migration
`20261023120000_intensity_act_sort_order`, started by name). Cross-cell drags light the target and draw a line
instead of moving cards live, so nothing shifts under the pointer; every move toasts Undo. The session's act list
follows the same order.

## Amendment 2026-10-23 — the act's panel (K2)

A click on a card opens the act's panel beside the board (a side-peek as in Linear or Notion; on narrow screens a
sheet): name, description, level as a number, scenario, where it is ticked (`Name (ICG-ID)`, session) and delete
(only while unticked). The card itself stays slim — title and tick count; double-click or F2 renames in place.
`?act=` in the address (History API, no server round trip) makes it linkable; ↑/↓ walk the cards, Esc and Back close.

## Amendment 2026-10-23 — the roadmap stops at K2

The catalog is set up once and then stays stable, so the planned bulk selection (K3), overview helpers (K4),
merge/replace/archive tools and the impact preview with change log are dropped as more than the use warrants. K0–K2
cover the setup. An act that is ticked and must go or join another is handled on request by a migration (backup, dry
run with rollback on every tenant, then all tenants), as Glamour → Solo was.

## Amendment 2026-10-23 — Max is set per tenant; values carry a heat colour

A fixed 10 did not hold. Max is now a tenant Setting (`intensity-max`, a whole number 3–20, default 10); the cap stays
half a step below it, and the Max extra sets Max. Lowering is refused while acts sit above the new cap or values
above it are described — they are named; the Max row's scale text moves with Max. Values are computed on read, so a
new Max re-rates everything at once and no act's level changes; the SQL filters take Max from the resolved predicate.
Every intensity value is shown in a continuous heat colour from 0 to Max (green → yellow → orange → red → violet, the
PGRADE ramp) — the catalog's scale, session values, peaks, the person's matrix and course, the header bar (a segment
per whole value).

## Amendment 2026-10-23 — boundaries between the levels

The lines between levels are real moral/mental boundaries a person crosses or gives up. A boundary is its own object
(`IntensityBoundary`: the value crossed, a title, a description), on the seam just below that value — one per seam,
from 0.5 up to Max. In the catalog it shows as a dashed line across the board with a marker in the Intensity column
(description on hover); the marker opens a band there to name and describe it, a "Boundaries" switch opens all,
"+ Boundary" on a seam adds one, delete has Undo. Lowering Max is refused while boundaries lie above it. For now the
catalog only; whether a person's crossed boundaries show elsewhere is decided once they are set.
Levels and boundaries are edited in the same side panel as acts (one place to edit; `?level=` / `?boundary=` in the
address, ↑/↓ walk the scale with boundaries in turn); the Intensity column is for reading — ▸ unfolds a description
there — with a double-click to rename in place.

## Amendment 2026-10-23 — extras may take points off

An extra's points may be negative (half steps, −20 to +20): a circumstance that makes an act easier. An act's value
stays between 0 and the cap (Max still sets Max); the SQL filters floor at 0 the same way. Extras are listed by
points, then name, so a group reads as its natural rise.

## Amendment 2026-10-23 — extras for some scenarios only

An extra counts in every scenario unless turned off there — for a group as a whole (a group is one dimension, e.g.
a partner), or for an extra without a group on its own; an extra in a group follows its group, Max always counts.
Stored as exclusions (`IntensityExtraGroupScenarioOff`, `IntensityExtraScenarioOff`), so a new scenario is counted
in. On a session the extra stays set for the person but does not count for acts in an excluded scenario — in the
app, on the person and in the SQL filters alike; the value's explanation names it ("— not in Solo").

## Amendment 2026-10-24 — intensity on sets

The session stays the one source (the photos are made there; the model's strain is rated there). A set is a release
of it and shows its sessions' intensity: a sidebar box, the same panel beside the set's photos (saving on the
session), a heat pill on the set card, and the /sets filter. For a session split into several sets (16 of 1106 in
xpulse) a set can leave a ticked act out (`SetActExclusion`, per person and act), hinted at when the act's evidence
photos all lie in another set. A person's peak stays the sessions' — what they did, not what a release shows.

## Amendment 2026-10-24 — presets and review

On xpulse about 1,200 on-camera contributions waited to be rated, and sessions of one kind (e.g. artistic nudes) repeat
nearly the same acts. Compared with order sets in clinical software, Lightroom/Photo Mechanic presets, pre-labels in
labelling tools, the review inbox of budgeting apps and the Stash tagger, the pattern is the same: **apply a bundle,
fix the deltas, confirm, go on** — and whatever was filled in for you stays visibly unchecked until you sign off.

1. A **preset** (`IntensityPreset`) bundles acts of any scenario and session extras. Applied to the selected models
   it ticks the acts each lacks — ordinary ticks that count at once, marked with the preset (`ContributionAct.presetId`)
   — and lays its extras over theirs (a grouped one replaces their choice). Nothing is taken away. It is a **copy**:
   editing or deleting a preset changes no session (deleted, its ticks only forget it).
2. **Review per model**: `SessionContribution.intensityReviewedAt`. A person is *unrated*, *to review* or *done*;
   applying a preset or copying (Same as…) clears it, hand edits don't. Confirming with no acts means "nothing to rate".
3. **One scenario per preset** (2026-10-25, the user: a partner preset makes no sense for someone alone): its acts
   are that scenario's and its extras those counting there. The panel offers the presets of the cast's suggested
   scenario as pills 1–9, under a scenario switch that starts on the suggestion and changes it in one click, since the suggestion can be wrong. A preset shows the value it gives (`presetValue`: highest act with its extras).
4. A value is the **highest** act, so the check that matters after a preset is "anything above it?": the panel lists
   the acts above the preset's highest first while someone is to review.
5. **The rating queue and the status filter** (2026-10-25): `rated:unrated|review|done` in the query language and a
   *Rated* facet on /sessions and /sets (leads only; a set's sessions together; `ratedSql` mirrors `sessionReview`).
   **Rate these** walks the list as filtered — the same parameters, parsed once in `list-filters.ts` — session by
   session (`/sessions/[id]?rate=sessions?…`), only those still to rate, ordered by the primary set's **Channel**
   (not the Label: a label is an umbrella over channels of different styles), then date. The session on screen
   stays in the queue once confirmed, so Prev/Next keep their place; **Confirm all & next** confirms every model.
6. **Like last time and the channel's usual preset** (2026-10-27): *Like last time…* copies a model's own latest
   confirmed session up to this date — same channel first, else any; undated sessions never count (`pickLastTime`).
   The menu names it (date, channel, value) before copying; it adds acts with their departures (no notes, no photos),
   lays its extras over as a preset does, and puts the model to review — Undo as for a preset (`PresetUndo` with
   `presetId` null). *Usual for {channel}* is the preset whose ticks the most confirmed models of the channel carry
   (`usualPreset`; the session itself not counted), the first pill — never applied by itself. Same channel as the
   queue: the primary set's. No schema change.
7. **Bulk from /sessions and /sets** (2026-10-27): *Intensity preset…* in the selection bar applies a preset to
   the models of the selected sessions (from sets: their sessions) — only those **not confirmed** (a bulk action must
   not undo checked work) and whose **cast fits** the preset's scenario (`suggestScenarioIds`; no suggestion fits
   any). The dialog previews the reach and what it leaves alone; Apply re-plans and refuses when the reach changed,
   then applies in pieces of 50 models (`applyIntensityPreset`), each landing to review; Undo in the same pieces.
   The presets-and-queue plan is complete.
