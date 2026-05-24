# Emergent Era authoring; sticky membership only for curated Eras

Decided 2026-05-23 (design review, /grill-with-docs — not yet implemented). **Amends ADR-0001.**

## Context

ADR-0001 modelled Eras as **curated folders** the user files deltas into deliberately, with sticky membership protecting the curation choice from accidental date edits. Subsequent user feedback during the /grill-with-docs session contradicted the "deliberate at filing time" assumption:

> "I'm NOT really thinking to which phase it belongs when I type the change in. More often those changes define a 'next era' (like that's the era with her rose tattoo, or that's the era with short blonde hair). VERY often I will not exactly know the exact date of the change but have to change the date later."

In the real workflow:

1. **Changes are primary** — the user thinks in changes, not phases.
2. **Eras are emergent** — named retrospectively as clusters of related changes are recognised.
3. **Dates are provisional** — frequently corrected after entry.
4. **The same record-a-change sheet sees two distinct intents:** "fill missing baseline info" (this was always true, just unrecorded — e.g. freckles never captured at import) vs "record an actual change" (this is new — e.g. lost 5 kg).

Under ADR-0001's sticky-always rule applied to a draft Era the user has never touched, sticky-membership protects a curation that was never made — and freezes an arbitrary auto-assignment against a later better guess from date corrections.

## Decision

ADR-0001 stands for **curated Eras**. The following amendments apply to **draft Eras** and to the **authoring flow**:

### Authoring flow

- The inline record-a-change sheet has **no Era picker**. The user enters value + date + notes only.
- The system **auto-clusters the new delta into a draft Era** by date proximity — joining an existing draft within ±N months of the delta's date, or starting a new draft otherwise. N is a tunable parameter (start at ±6 months; revisit empirically).
- **"I don't know yet" is a first-class date option.** When the user explicitly ticks it (instead of providing a date), the delta is saved with `date = null` / `datePrecision = UNKNOWN` and lands in a **dateless draft Era** — a draft Era whose members are all undated and whose auto-derived range is therefore empty. The timeline renders such Eras in a soft-flagged "Undated changes" section with per-delta "Set date" affordance. When a date is later set on the delta, draft non-stickyness (below) migrates it into the appropriate dated draft Era; when the dateless draft Era empties it auto-deletes. This is *not* Baseline — Baseline carries the "this was always true" semantic, which the disclosure toggle elsewhere covers.
- **Baseline-fill vs change-record is a UI default inferred from history:** an attribute with no prior delta defaults to "Add to baseline" (dateless delta on the Baseline Era); an attribute with existing history defaults to "Record a change" (dated delta on a draft Era). Both are overridable.

### Sticky membership scope

| Era state | On delta date-edit | Rationale |
|---|---|---|
| **Curated** (user has named / promoted from draft) | **Sticky** — date change does not move the delta. ADR-0001's behaviour. | Protects deliberate curation. |
| **Draft** (auto-assigned, never touched) | **Non-sticky** — re-clusters with whichever draft now best matches the corrected date. | No curation to protect; the auto-assignment was a guess and a better guess is now possible. |

### Curation as a nudge, not a step

- **Trigger:** when a draft Era accumulates 3+ deltas, the Overview History panel surfaces a soft prompt next to the Era's auto-derived label ("2017 · 4 changes · *Name this phase?*").
- **Suppression:** dismissing the nudge on a given Era hides it for 7 days; re-appears thereafter or when a new delta lands in the Era.
- **Optional aggregate badge:** the Overview tab label shows a small count when ≥1 draft Era is over the threshold (`Overview · 2 draft eras ready`). Avoids forcing the user to enter the tab to discover unnamed phases.
- **Promotion sheet (inline):** a tiny editor — name field + checkbox list of the deltas currently in the Era (default all checked; uncheck stragglers to split them into a separate draft). Save promotes the Era to curated, sticky membership kicks in, and the nudge disappears.

## Why

- **Matches the user's actual workflow.** Eras as filing categories were a workflow tax: filing required curation thinking the user wasn't doing at the time. Removing the picker eliminates the tax.
- **The sticky-membership safety remains where it matters** — once the user has *deliberately* curated an Era, the protection ADR-0001 designed kicks in.
- **Date corrections become improvements, not damage events.** A user fixing a delta's date in a draft Era now improves the cluster instead of locking it.
- **State-of-the-art aligned.** Apple Photos "Memories" auto-clusters by date/location proximity, presents events as suggestions, and lets users name/curate when they care — provisional until touched. Notion/Obsidian tags follow the same shape: notes first, tags retrospectively.

## Considered and rejected

- **Keep sticky-always (ADR-0001 unamended) + add a "re-cluster" button.** Pushes the work back onto the user manually; defeats the point of auto-assignment.
- **No drafts at all — every Era is created explicitly by the user.** Returns to the friction tax the user explicitly described as not matching their workflow.
- **Draft membership is non-sticky and curation is a forced step at threshold N deltas.** Forcing curation breaks "changes are primary"; a nudge respects user attention while keeping the path open.
- **Baseline-fill vs change-record as two separate sheets.** Two sheets for the same data operation is structural noise; a default inferred from history is enough.

## Consequences

- The fold/cache logic remains identical (ADR-0003 unaffected) — the fold still sorts by delta date and is indifferent to Era membership.
- Delta date-edit code must check `era.isDraft` and re-cluster the delta when true; the `cascade-helpers` layer is the natural seam for this.
- **Existing draft Eras** created under the old sticky-always (calendar-year-bucket) rule are **left as-is** when this ADR ships — forward-only behaviour. New deltas use the new rules; existing groupings stand. To opt in per-person, the Overview History panel exposes a `Re-cluster drafts` action that previews old-grouping → new-grouping (using the ±6-month algorithm) and lets the user apply or cancel. Curated Eras are never touched. No automated bulk migration; no forced wizard.
- `record-physical-change-sheet.tsx`, `edit-physical-change-sheet.tsx`, `new-era-sheet.tsx` and `entity-event-timeline.tsx` need updating. The Era picker is removed from the inline change sheets; the timeline gains the draft-promotion nudge.
- The N-months clustering window is tunable and should be revisited after real usage data lands.
