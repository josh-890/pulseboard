-- Plan slice 2: let a set credit hold on to a known ICG-ID.
--
-- promoteManualStagingSet wrote unknown participants as SetCreditRaw with only
-- rawName + UNRESOLVED, dropping the icgId the staging set held in
-- participantStatuses. The unique key — canonical per ADR-0026 — was lost at the
-- moment of promotion, leaving later resolution to ambiguous name matching.
--
-- A participant with a known ICG-ID but no curated Person now resolves to a
-- Contact (the ADR-0022 ghost register). onDelete: SetNull matches the existing
-- resolvedAliasId convention; repointContactToPerson moves these onto
-- resolvedPersonId BEFORE the contact row is deleted, so the null path should
-- never be taken in practice.

ALTER TABLE "SetCreditRaw"
    ADD COLUMN "resolvedContactId" TEXT;

ALTER TABLE "SetCreditRaw"
    ADD CONSTRAINT "SetCreditRaw_resolvedContactId_fkey"
    FOREIGN KEY ("resolvedContactId") REFERENCES "PersonRef"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SetCreditRaw_resolvedContactId_idx"
    ON "SetCreditRaw" ("resolvedContactId");
