# Import-fed baseline values are best-guess; no Snapshot type

Decided 2026-05-28 (design review, /grill-with-docs — not yet implemented beyond existing behaviour).

## Context

Many import sources publish point-in-time observations (Hair Colour, Weight, Measurements, current photo, breast measurements) **without era information**. The temporal model (ADR-0001, ADR-0005, ADR-0007) stores attributes as era-linked `ScalarDelta` rows, with a strong invariant: a delta on the Baseline Era represents the *starting / natural value*. Routing a "current" observation to Baseline therefore makes a claim the source did not make — that the observed value *is* the natural one.

For persons with no changes since the observation, snapshot ≡ baseline and the default is benign. For persons who have changed (surgical enhancement, hair dye, weight gain), the default silently mis-attributes post-change data to the natural-state era. The concrete trigger was a 2026-05-26 audit of `cattr-measurements` deltas on xpulse: **Lilit A** has a `B → D` SURGICAL breast change, and her imported Measurements string `34D-23-35 / ~89-58-89` is the post-enhancement snapshot. Writing `Bust=89cm` to her baseline era under the planned Slice 16D Step 3 migration would falsely claim her natural bust was 89cm.

The principle generalises beyond Measurements: every "current X" field in import files (hair colour, weight, build, …) has the same shape.

## Decision

**No `ScalarSnapshot` row type, no new value type, no new schema dimension.** Imported observations remain ordinary `ScalarDelta` rows. The tension is resolved by a **routing policy at import time**, not by extending the data model.

### The five principles

1. **Baseline-completeness.** Baseline is meant to hold the person's best-guess complete physical profile. A populated baseline is more valuable than a sparse-but-verified one.
2. **Import-feeds-baseline by default.** Any imported observation lands on the Baseline Era unless the source explicitly signals otherwise. The value is treated as the baseline starting value.
3. **Source-explicit-status exception.** When the import file itself signals a non-natural state — e.g. `breastDescription="enhanced or fake"` — the value does *not* go to baseline. It routes to the per-person `"Imported — undated changes"` Era with the appropriate `cause` (`SURGICAL` for enhanced breast). Baseline receives a separately-extracted natural value if the file provides one.
4. **Completeness has a limit.** When the source-explicit exception fires and *no* separate natural value is available in the same import row, baseline stays *empty* for that attribute. The hero / Appearance grid surfaces it as **unknown** so the user can search for the gap and fill it manually.
5. **Manual curation is the correction mechanism.** Mis-attributed baseline values are an accepted risk; the user fixes them on sight when they realise a person's "natural" hair colour is actually dyed, or their baseline weight is actually a post-gain value. The existing inline-edit on baseline deltas plus record-a-change on later eras already supports this.

### Mutability is not the gate

We considered making `mutability` (ADR-0005) the routing gate — `ALWAYS_STATIC` → baseline, `VOLATILE` → undated era. Rejected: the variance between snapshot-safe-on-baseline and snapshot-unsafe-on-baseline does not cleanly correlate with how often the attribute changes. A `VOLATILE` attribute (Hair Colour) is still routed to baseline under this ADR, because completeness wins by policy. Mutability continues to drive UI affordance (ADR-0005), not routing.

### Measurements is a special low-stakes case

`cattr-measurements` is a TEXT-valued catalog attribute. The original Slice 16D Step 3 plan (parser + automatic migration into discrete `Bust`/`Waist`/`Hips` scalars) is **cancelled** in its automatic form. The import continues to pass the raw Measurements string through to a baseline TEXT delta — explicitly accepting that for changed persons (Lilit) the TEXT will be wrong, because the user does not actively read this field. Canonical structured `Bust` / `Waist` / `Hips` scalars are added as separate **manually-authored** catalog defs; the edit UI offers a US→cm conversion helper but does not auto-derive at import time. The two families coexist without a sync rule.

## Why

- **The model already supports correction.** Baseline deltas are editable, later eras can be added, the fold re-derives state. No new type is needed to "make snapshots first-class".
- **Completeness beats verification for this product.** The user has stated explicitly that they prefer a populated baseline they can audit over a sparse baseline with verified provenance. The cost of mis-attribution is bounded (rare, manually fixable, low-impact for most fields).
- **One fold path, one read shape.** Same reasoning as ADR-0002 and ADR-0005: introducing `ScalarSnapshot` would add branches everywhere `valueType` and `ScalarDelta` are consumed (fold SQL + TS, scalar UI primitives, edit sheet, search service). The user did not endorse paying that cost for a degree of freedom that manual curation already covers.
- **The source-explicit exception is narrow and earned.** It exists because `breastDescription` actually carries a "natural/enhanced" flag in the import file — that's real information, not inference. We do *not* try to detect implicit non-natural states (a dyed-hair person, a weight-changed person) because the source doesn't tell us; under principle 5, the user fixes those on sight.
- **Searchable gaps make manual curation tractable.** Principle 4 (baseline stays unknown when the exception fires without a natural value) gives the user a search target: "all persons with baseline Breast Size unknown". A predictable list is more useful than a silently-wrong baseline.

## Considered and rejected

- **`ScalarSnapshot` row type.** A first-class observation row distinct from a delta, written by the import, optionally promotable to a delta on a specific era. Gives clean type safety and preserves "baseline = verified" semantics. Rejected: invasive change touching the fold, every UI primitive, the search service. The user's correctness bar (acceptance of mis-attribution + manual fix) does not justify the cost.
- **Mutability-gated routing.** `ALWAYS_STATIC` → baseline; `RARELY_CHANGES` → baseline; `VOLATILE` → undated era. Rejected: contradicts the completeness principle. A volatile attribute's snapshot is still the most informative baseline value we have; suppressing it leaves a gap with no upside.
- **Per-person conditional routing.** "If this person already has any deltas for this attribute, the new import value goes to the undated era; else baseline." Rejected: doesn't help the actual case (Lilit's hair colour mis-attributes because the source didn't tell us she dyed it — no amount of conditional logic at import time can recover that). Also adds order-dependence to re-imports.
- **Two distinct undated eras per person** (`"Imported — undated changes"` for SURGICAL, `"Imported — snapshot"` for neutral observations). Rejected: under the principle adopted here, neutral observations don't go to an undated era at all — they go to baseline. The existing `"Imported — undated changes"` era keeps its narrow SURGICAL-only semantic and its name.

## Consequences

- **Existing import behaviour is largely preserved.** `import-executor.ts` already routes natural breast cup to baseline and "enhanced" cup to `"Imported — undated changes"` — that is exactly the source-explicit-status pattern this ADR generalises. Hair Colour, Height, Eye Colour are already written to baseline. No code change is required to align with the principle.
- **One known import bug surfaces under principle 4.** When `breastDescription="enhanced"` arrives but no separately-extractable natural cup exists, today's code writes the post-enhancement cup to *both* baseline and the undated era — falsely claiming the enhanced value is natural. Fix: write only to the undated era; leave baseline empty so the gap is searchable.
- **Slice 16D Step 3 is reshaped, not resumed as planned.** The original "parser + migrate 17 deltas + drop `cattr-measurements`" plan is dead. New shape: add `Bust` / `Waist` / `Hips` numeric catalog defs (manual-only authoring), add a US→cm conversion helper in the edit UI, retain `cattr-measurements` as a TEXT pass-through indefinitely. The 17 existing TEXT deltas on baseline remain as-is.
- **Audit hooks are now load-bearing.** Principle 4 commits the product to a "search baseline = unknown" affordance per attribute. Without it, the carve-out becomes invisible work. Confirm coverage in `person-search-service.ts` before declaring this ADR landed.
- **Re-import semantics need a separate decision.** When the same person is re-imported with a new snapshot, overwriting baseline silently could lose curated values. Out of scope here; flag it for a follow-up grilling on the import workflow.
- **The `"Imported — undated changes"` Era name stands.** It correctly describes its content under this ADR: only `cause=SURGICAL` (and future `cause=OTHER`) deltas with no known date land there. Neutral observations stay on baseline, so the "changes" in the name remains accurate.
