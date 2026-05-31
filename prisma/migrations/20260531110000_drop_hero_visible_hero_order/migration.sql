-- Drop heroVisible + heroOrder columns from BodyMark, BodyModification,
-- CosmeticProcedure.
--
-- Phase G Slice 15 (2026-05-25) replaced the per-instance "hero pin" model
-- with type-presence chips: the hero card now answers "what TYPES of body
-- features does this person have?" (sourced from
-- PersonCurrentState.presentBodyFeatureTypes), not "which specific marks
-- are pinned?". The pin/unpin UI in the row components has been silently
-- non-functional since then — the toggle wrote to the column but nothing
-- read it.
--
-- Code changes that ship with this migration:
--   - body-mark-row.tsx + body-modification-row.tsx — Pin/PinOff toggle
--     button removed from the expanded toolbar. Pin/PinOff icon imports
--     dropped.
--   - cosmetic-procedure-row.tsx — file deleted entirely (was orphan
--     code; CosmeticProcedure as a category was removed by ADR-0007).
--   - appearance-tab.tsx — onToggleHeroVisibility prop passes removed
--     from both row renders; handleToggleHeroVisibility helper deleted;
--     toggleEntityHeroVisibility import dropped.
--   - appearance-actions.ts — toggleEntityHeroVisibility server action
--     deleted; replaced with a comment pointing future work at the
--     presence-types model.
--   - person-service.ts — 7 deriveCurrentState/getPersonWithDetails
--     callsites stop including heroVisible/heroOrder.
--   - person-detail-tabs.tsx — hasHeroEntities flag now reads
--     currentState.presentBodyFeatureTypes.length > 0 (the new model).
--   - lib/types/person.ts — heroVisible/heroOrder fields removed from
--     BodyMarkWithEvents, BodyModificationWithEvents,
--     CosmeticProcedureWithEvents.
--
-- The CosmeticProcedure table itself remains in the schema until Slice 17
-- (per ADR-0007 / project_slice5_cosmetic_procedures_deprecated); dropping
-- its hero columns now is harmless either way.

ALTER TABLE "BodyMark"          DROP COLUMN "heroVisible", DROP COLUMN "heroOrder";
ALTER TABLE "BodyModification"  DROP COLUMN "heroVisible", DROP COLUMN "heroOrder";
ALTER TABLE "CosmeticProcedure" DROP COLUMN "heroVisible", DROP COLUMN "heroOrder";
