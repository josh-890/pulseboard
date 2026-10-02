-- Quick-tag slot sets (ADR-0033, S3): named sets of up to nine tags bound to
-- the keys 1–9. At most one set is active (partial unique index); a slot's
-- position is 1…9. Deleting a tag or a set removes its slots.
CREATE TABLE "tag_slot_set" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_slot_set_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tag_slot" (
    "slotSetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,

    CONSTRAINT "tag_slot_pkey" PRIMARY KEY ("slotSetId","position"),
    CONSTRAINT "tag_slot_position_check" CHECK ("position" BETWEEN 1 AND 9)
);

CREATE UNIQUE INDEX "tag_slot_set_name_key" ON "tag_slot_set"("name");
CREATE UNIQUE INDEX "tag_slot_set_one_active" ON "tag_slot_set"("isActive") WHERE "isActive";
CREATE INDEX "tag_slot_tagDefinitionId_idx" ON "tag_slot"("tagDefinitionId");

ALTER TABLE "tag_slot" ADD CONSTRAINT "tag_slot_slotSetId_fkey" FOREIGN KEY ("slotSetId") REFERENCES "tag_slot_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tag_slot" ADD CONSTRAINT "tag_slot_tagDefinitionId_fkey" FOREIGN KEY ("tagDefinitionId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
