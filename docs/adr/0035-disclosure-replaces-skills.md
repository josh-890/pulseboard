# ADR-0035: Disclosure replaces Skills — levels × situations, evidenced by sessions

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

"Skills" (`PersonSkill` + `SkillDefinition` catalog + `PersonSkillEvent` log + the CP/WCP
scores) was modelled on what a person *can do*. Real use says otherwise:

- xpulse, 2026-10-20: the only skills in use sit in a group "Solo" — *Nudity (partial) →
  Nudity (fullbody) → Nudity (Pussy Visible) → Erotic Posing / Pussy (Focus) → Mild
  Spreads* — tagged on session contributions. That is a ladder of **what a person shows**,
  not an ability.
- pulse: five real skills (Acting, Fitness, Stunts) on five people.

What the user records is **the expression of what a person reveals** — a clear gradation,
physical and above all emotional/mental: boundaries crossed, things allowed. And how big a
step is depends on the situation: alone in a studio is not the same as with another person,
and not the same as in public.

The skill code was also broken where it mattered: the link between a demonstrated skill and
its session lived as text in `notes` (`[session:ID] …`), so session merge and delete left
events pointing at sessions that no longer exist; editing a skill wiped its events; linking
media from the lightbox called a route that never existed.

### How other tools handle it

- **Spotlight / Backstage / Casting Networks** — skills are a self-declared profile list,
  there to be searched by casters; level is coarse at most (Spotlight: one "highly skilled"
  flag; Casting Networks: three steps plus a clip as evidence).
- **MusicBrainz / Discogs** — what someone *did on a work* is a structured credit with
  attributes (the instrument sits on the performer relationship), separate from free tags
  on the artist. Ability follows from credits.
- **LinkedIn** — skills are tied to jobs and projects as evidence; endorsements proved weak
  signals and assessments were discontinued.
- No industry standard exists for a scale of what a model shows; wording varies
  ("nudity level", "comfort zone", "content level").

## Decision

1. **Words.** *Disclosure* is what a person reveals; a *disclosure level* is one step of it.
   A *boundary* is the line between two levels; reaching a level for the first time is a
   **boundary crossed**. "Skill" is retired. ("Exposure" was rejected — it means a photo's
   exposure in this app; "grit" names perseverance, not revealing.)
2. **A matrix.** Columns are **situations**, ordered by how much interaction they ask:
   Glamour (classic modelling, no action of one's own) · Solo (action of one's own) · G-G ·
   G-B · Group · Special. Each column has **its own ordered ladder** of levels; the same
   action may sit in two columns at different steps. The matrix is a catalog, edited in
   Settings, per tenant.
3. **Evidence is the session.** An entry says: this person, in this session (a
   `SessionContribution`), showed this level. A contribution may carry several entries — a
   mixed shoot fills several cells. The entry hangs off the contribution by foreign key, so
   merging sessions moves it and deleting one removes it.
4. **Situation is suggested from the cast** — alone → Glamour or Solo (the user picks),
   with one more woman on camera → G-G, with a man → G-B, two or more others → Group;
   Special is chosen by hand. The suggestion is only a preselection.
5. **Setting is recorded, not yet weighed.** Each entry may carry a setting (private/studio
   … public). The same action in public is a bigger step — but the rule for how far a
   setting shifts a level is not settled, so it is captured now and applied later.
6. **Crossings are computed, never stored** (as ADR-0002): first reached, jump size and
   time between steps are derived from the entries and their sessions' dates, so correcting
   a session corrects the history.
7. **Score.** Per column, the highest level reached as a share of the ladder (0–10);
   overall, the mean weighted by column weight. It replaces CP/WCP. The manual
   `Person.pgrade` stays.
8. **Real skills become person tags** (pulse's Acting, Fitness, Stunts → "Person traits").
   The Skills models, tab, catalog and scores are removed once their data is carried over.

## Consequences

- Three new catalog tables (situation, level, setting) and an entry table on
  `SessionContribution`; Skills' six tables go when slice 5 runs.
- Filtering People by "Solo ≥ level n" and the score become possible without parsing text.
- Open: the setting → level shift rule; the score formula's weighting once real data exists.
