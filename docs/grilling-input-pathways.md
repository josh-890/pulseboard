# Grilling brief — Person input pathways UX consolidation

Status: **not yet grilled**. This document is the opening brief for a
distinct grilling session on the consistency and user-guidance quality
of every UI pathway by which a user enters or edits a Person's physical
and identity data.

The user is **not happy** with the current state. Reference standard:
the user feels the best comparable apps (LinkedIn profile sections,
Notion property editing, Apple Health "Add Data", Linear issue creation,
Things-style focused detail panes, talent-management tools in entertainment)
offer a much more *instinctive* UX where the right action is obvious and
the wrong action is hard to take. Pulseboard today has 22 distinct entry
points across 3 data domains and several visible overlaps.

> Hard rule: nothing hardening assumptions in any of these flows ships
> until grilled. Same shape as `[[project_import_vs_archive_channel_taxonomy]]`.

## Pathway inventory (current state)

22 distinct entry points across 7 functional clusters. Detailed map below;
this is the surface area we're trying to simplify.

### 1. Core physical attributes (hair color, weight, build, breast size)
- `record-physical-change-sheet.tsx` — "Record Change" button on Appearance tab. **Temporal**: 3-way intent (on-date / dateless / baseline). Writes ScalarDeltas batched into baseline / draft / dated Era.
- `edit-physical-change-sheet.tsx` — pencil on a recorded change. **Temporal**: same 3-way intent.
- `edit-appearance-sheet.tsx` — "Edit Appearance" button. **No temporal semantics** — writes Person columns directly. **Overlap with record-physical-change is the biggest UX hazard.**

### 2. Person identity (aliases, ICG-ID, birthdate, nationality, sex, bio)
- `edit-person-sheet.tsx` — header pencil. Direct Person update.
- `add-alias-sheet.tsx` (add/edit modes) — alias name + isCommon + isBirth + channel links.
- `alias-import-dialog.tsx` — bulk alias paste.
- `change-icg-id-dialog.tsx` — nested in edit-person-sheet. Shows impact preview.
- `digital-identity-section.tsx` — inline CRUD on Aliases tab.

### 3. Person creation
- `person-form.tsx` — shared form component.
- `create-person-sheet.tsx` and `add-person-sheet.tsx` — **functionally identical**, two entry points (detail page vs list page). Both wrap person-form.

### 4. Import workflow
- `ImportPersonReview` — per-row Accept/Decline + 3-way intent (mirrors record-physical-change).

### 5. Body marks (tattoos / birthmarks / scars)
- `add-body-mark-sheet.tsx` / `edit-body-mark-sheet.tsx`
- `add-body-mark-event-dialog.tsx` — properties at event scope.

### 6. Body modifications (piercings / implants / etc.)
- `add-body-modification-sheet.tsx` / `edit-body-modification-sheet.tsx`
- `add-body-modification-event-dialog.tsx`

### 7. Era authoring
- `new-era-sheet.tsx` — explicit era creation with bulk event batch.
- `era-timeline-entry.tsx` — inline era edit + promote-draft-to-baseline.
- `scalar-delta-inline-editor.tsx` — per-delta inline edit (date, precision, cause, intent).
- `add-attribute-picker.tsx` — catalog browse → opens record-physical-change.

### Shared primitives (where the consistency story should live)
- `TypedAttributeInput` (catalog-driven), `ColorValueCombobox` (hair/eye/skin), `SelectWithOther` (build/breast/length), `CoreFieldRow` (Tier 1 + "don't know"), `PartialDateInput` (every temporal field), `MutabilityPrimitive` (read-only render).

## Known overlap + confusion points

| A | B | Issue |
|---|---|---|
| `edit-appearance-sheet` | `record-physical-change-sheet` | Both write Tier 1 attrs. Appearance bypasses temporal tracking entirely — users silently lose history. |
| `AddPersonSheet` | `CreatePersonSheet` | Functionally identical. Two entry points, one form. |
| `add-alias-sheet` (add mode) | `alias-import-dialog` | Same goal (add alias), different scale. UI doesn't signal which to pick when. |
| `new-era-sheet` | `record-physical-change-sheet` | Both can produce a dated era. Era is explicit; Record accumulates into draft. Users unsure which to pick for "I found photos from 2015." |
| `add-body-mark-event-dialog` | `edit-body-mark-sheet` (inline date) | Event vs property-edit semantics fuzzy. Inconsistent when multiple events exist. |
| `AddAttributePicker` → `record-physical-change-sheet` | — | After picker, sheet opens without pre-scrolling or pre-focusing the just-picked attribute. |

## Confusing-by-design patterns

1. **"Record Change" vs "Edit Appearance"** — both exist because ADR-0006 made temporal-tracking the canonical path, but legacy edit-appearance was never removed. UI copy doesn't disambiguate.
2. **Dateless draft Era concept** — powerful (per Slice 7 / Slice 9), but the term "Undated changes" never explains *what it is* to the user. "I'm not sure when this happened" should be a state, not an architectural artifact users learn the name of.
3. **Intent radio "baseline" option** — appears in 4 different surfaces, never explained.
4. **Body Mark properties vs event-level overrides** — UI doesn't surface which scope the user is editing.
5. **"Track new attribute" vs "Record change"** — separate buttons, conceptually overlap.
6. **Inconsistent shared primitives** — `TypedAttributeInput` has a `?` popover (Phase 1, just shipped) but `SelectWithOther` got the two-line items only recently and inline color picker uses its own dedicated component; the user sees three different visual languages for "pick a value."

## Comparable apps the grilling should reference

- **LinkedIn profile** — section-based editing, inline-where-possible, one consolidated sheet per section.
- **Notion property editor** — type-aware single primitive that handles every value type with consistent affordances; helper text inline.
- **Apple Health → Add Data** — single category + current value + date sticker. Three taps to log a change.
- **Linear issue editor** — keyboard-first inline edits, sheet only for multi-step actions.
- **Casting / talent-management tools (Casting Networks, Cast.io)** — the closest domain analogue. Physical attributes + media + dated history.

## Open questions the grilling needs to land

Approximate order — adjust during the session.

1. **Should `edit-appearance-sheet` be deleted outright?** All-or-nothing or migrate to a "quick edit" surface that still creates a baseline-intent delta under the hood (no temporal silent-bypass)?
2. **Can we collapse to ONE primary "edit this person" surface** with progressive disclosure, or do we keep multiple sheets but reorganise their triggers so the right one is obviously findable?
3. **Where does temporal authoring live?** Per-field inline vs per-change sheet vs explicit timeline view. The 3-way intent radio is the right model — but is it surfaced in the right place?
4. **How do we explain "baseline" / "dateless draft" to a user who's never read an ADR?** UI copy needs to land the concept without naming the concept.
5. **Can the body-mark/modification add+edit+event flows merge into one creature?** Today's three-sheet split for each entity type doubles the surface.
6. **Single primitive for "pick a value"?** TypedAttributeInput is the closest, but ColorValueCombobox and SelectWithOther run in parallel. Can we consolidate or unify the visual language?
7. **Discovery affordance** — when should the user reach for the catalog picker vs scrolling a sheet vs inline + suggested? `AddAttributePicker` exists but Track-vs-Record splits the surface.
8. **Mobile / one-handed considerations?** All current surfaces assume desktop. Worth scoping in.

## Pointers

- ADR-0006 — temporal tracking is the canonical path.
- ADR-0007 — DeltaCause + AttributeStatus (status pill rules).
- ADR-0008 — import-fed baseline best-guess.
- ADR-0009 — review-driven re-import merge (Accept/Decline + 3-way intent — same radio used in record-physical-change).
- `project_emergent_era_workflow.md` — record-a-change has NO Era picker; eras are emergent labels.
- `project_scalar_attribute_ui.md` — 3 deterministic mutability primitives.
- `project_identity_bearing_ui.md` — Body Features unification.

## How to start the grilling

Open this file. Invoke `/grill-with-docs` (the user's skill). Walk down the
open-questions list one at a time, exploring the codebase to ground each
answer in current behaviour rather than assumed behaviour. Update
`CONTEXT.md` for each term that gets sharpened ("baseline", "dateless
draft", "intent", "track" vs "record"). Open an ADR if a decision is
hard-to-reverse and not obvious to a future reader.

Don't ship code from this document. Grill first. Code comes after the
grilling produces concrete decisions.
