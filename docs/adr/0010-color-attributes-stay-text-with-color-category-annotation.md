# Color attributes stay TEXT with a `colorCategory` annotation, not SINGLE_SELECT

Decided 2026-06-01 (Slice 16E, design review via `/grill-with-docs`).

## Context

Pulseboard's physical-attribute catalog has three attributes whose value space
is governed by a separate `color_catalog` table rather than a flat enum:
`hair_color`, `eye-color`, `skin-tone`. The catalog holds 67 hair + 43 eye +
22 skin entries, each carrying derived metadata — `hue`, `shade`, `shadeRank`
— that the SQL fold consumes to populate cached columns on
`PersonCurrentState` (`hairHue`, `hairLightness`, `hairLightnessRank`, etc.).

A dedicated React component `ColorValueCombobox` already exists to present a
hue-grouped picker, with an "Other…" escape hatch that writes new
`color_catalog` rows tagged `needs_review=true` for admin curation.

The three catalog-bound attribute definitions today carry `valueType = TEXT`
with an empty `allowedValues` array. Every parent UI component that wants to
edit one of these three attributes (6 callsites across 5 files:
`record-physical-change-sheet`, `edit-physical-change-sheet`,
`edit-appearance-sheet`, `person-form`, `new-era-sheet`) imports
`ColorValueCombobox` directly and slug-checks to invoke it. The generic
catalog-driven primitive `TypedAttributeInput` cannot route to the correct
input for these slugs — its `TEXT` branch renders a plain `<Input>`.

This is real code debt: every new edit surface has to remember which slugs
are catalog-bound, and the parent components carry knowledge that belongs on
the attribute definition itself.

## The obvious-but-wrong path: `SINGLE_SELECT` with `allowedValues` = catalog

A future maintainer (or LLM) sees three TEXT attrs with an associated
catalog table and reasonably proposes: just make these `SINGLE_SELECT` and
populate `allowedValues` from `color_catalog`. The picker is generic, the
data is constrained, no special routing needed.

This destroys the ecosystem the catalog exists to power:

- `allowedValues: String[]` carries only labels. There's no way to store the
  per-entry `hue` / `shade` / `shadeRank` triple alongside it without
  parallel arrays or JSON shoved into a string column — neither is a sane
  design.
- The `lookup_hair_hue` / `lookup_eye_shade` / `lookup_skin_undertone` SQL
  functions exist precisely because the fold needs to derive cached
  `hairLightness`, `eyeHue`, `skinUndertone` from the textual color value.
  Those derivations would have nowhere to live in a SINGLE_SELECT world.
- The "Other…" escape hatch (write a new `color_catalog` row inline from
  the picker) needs a richer row than a single string — `display`, `hue`,
  `shade`, etc. — and a `needs_review` curation queue. A SINGLE_SELECT
  flow can't accommodate that without bolting parallel infrastructure on
  top.
- The `ColorCatalog` table is the authoring surface — admins curate `hue`
  and `shade` per entry at `/settings/catalogs/colors`. Migrating
  `allowedValues` from that table on every change would amount to
  shipping a denormalised copy of the same data — extra wire format,
  more sync to break.

The user's pre-existing invariant: *"Hair/Skin/Eye Color use color_catalog +
lookup_* SQL functions for hue/lightness/shade decomposition; never replace
with flat SINGLE_SELECT"* (memory `feedback_preserve_color_catalog_ecosystem`).
This ADR is its checked-in form.

## Decision

Three changes, one slice:

1. **`PhysicalAttributeDefinition.colorCategory` (nullable enum)** —
   a new column on the existing definition table. Values:
   `ColorCategory { hair, eye, skin }` (Prisma enum). Three rows get
   backfilled (`hair_color`, `eye-color`, `skin-tone`); everything else
   stays NULL. `valueType` stays `TEXT` for the three attrs — the storage
   semantics are unchanged.

2. **`TypedAttributeInput` early-routes on `colorCategory`** — before the
   `valueType` switch. If `definition.colorCategory != null`, render
   `<ColorValueCombobox category={definition.colorCategory} ... />`.
   The 6 callsites of `ColorValueCombobox` in parent components are deleted;
   every edit surface now goes through `TypedAttributeInput`.

3. **`ColorCatalog.pickable` (Boolean, default true)** — a second new
   column. Filters which entries appear in the picker. Lets the user keep
   the full vocabulary (`espresso`, `chocolate`, `dark brown` — same hue,
   distinct name) while showing a curated subset in everyday editing.
   `/settings/catalogs/colors` gets a per-row toggle; deselected entries
   show in the manager with a "non-pickable" badge for re-enabling.

## Consequences

### Picker behaviour with a deselected current value

If a person has `hair_color = 'espresso'` and an admin marks 'espresso' as
`pickable=false`, the row stays in `color_catalog`. The fold still resolves
hue/shade. Read-side displays still show "Espresso." Only the picker
filters it out — *except* when the user opens that person's editor: the
component augments the fetched list with the person's current value, tagged
with a muted `(legacy)` parenthetical. The dropdown stays focused for new
picks; the user never wonders "where did the current value go." Selecting it
again is allowed.

This is policy (α) of the three considered. Policy (β) — strictly
pickable-only — was rejected because it would route legacy values through
the "Other…" custom-text path and falsely imply the user typed them
freeform. Policy (γ) — force-migrate on deselect — was rejected because it
destroys information; the value `'espresso'` may carry semantic weight
(e.g. it was the source's exact word) that admins want preserved.

### No DB-level constraint on `ScalarDelta.value`

Considered but rejected. The picker is the only realistic write path. The
"Other…" flow guarantees any value the user can pick has a matching
`color_catalog` row. The casing-normalization sliver (commit `26e8d2c`)
already canonicalised case drift. Adding a trigger or CHECK to enforce
catalog membership protects against a threat model that doesn't exist —
pure cost, no realised payoff. If a future script-fed write path emerges,
adding the constraint then is a one-migration job.

### Stored values are not migrated

`ScalarDelta.value` strings stay exactly as written by the picker. No
canonicalisation pass, no rewrite of legacy values. The columns added by
this slice are additive metadata only. Rolling back the slice
(`colorCategory` → NULL, `pickable` column dropped) is a clean reversal.

### `ColorValueCombobox` stays as a focused component

`TypedAttributeInput` does not absorb the color-picker logic. It becomes a
thin router that delegates to `ColorValueCombobox` when
`colorCategory != null`. The picker remains independently testable and
usable in any ad-hoc surface that doesn't go through the typed-attribute
abstraction (admin tools, future curation flows).

## Alternatives considered

- **Plain TEXT, no annotation.** Status quo. Rejected because every new
  edit surface has to repeat the slug-check, and `TypedAttributeInput`
  silently renders the wrong primitive (plain `<Input>`) for these slugs
  if anyone forgets.

- **SINGLE_SELECT with allowedValues from color_catalog.** Rejected on the
  grounds above — destroys the hue/shade/shadeRank decomposition and the
  `lookup_*` ecosystem.

- **A new `valueType = COLOR_CATALOG_REF` enum case.** Considered. The
  `valueType` already encodes input semantics (TEXT / SINGLE_SELECT /
  NUMERIC / ORDINAL / BOOLEAN); adding a sixth value for a use case that
  exactly three attrs in the catalog will ever take is over-formalisation.
  A nullable annotation column is more honest about the actual cardinality
  ("these specific attrs are color-bound") and orthogonal to `valueType`
  (the storage *is* still TEXT).

- **`pickable` policy: hide deselected vs strict pickable vs force-migrate.**
  See "Consequences" above — policy (α) won on the user-experience axis.

## Pointers

- `[[feedback_preserve_color_catalog_ecosystem]]` — the invariant.
- `color_catalog` table (`prisma/schema.prisma:2046+`).
- `lookup_hair_hue` / `lookup_eye_shade` / `lookup_skin_undertone` etc.
  (`prisma/migrations/20260518000001_color_catalog/migration.sql`).
- The fold (`app_recompute_person_current_state`) — last redefined in
  `prisma/migrations/20260531120000_drop_personcurrentstate_presence_booleans`.
- Casing-normalization sliver — commit `26e8d2c`.
- Slice 16E project memory: `[[project_slice_16_pending]]`.
- Grilling that produced this ADR: 2026-06-01 in-session walk.
