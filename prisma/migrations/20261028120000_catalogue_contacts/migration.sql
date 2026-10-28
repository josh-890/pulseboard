-- ADR-0038: the person catalogue becomes the Contact register.
-- Catalogue evidence on Contact, Contact aliases per channel (channel as a name,
-- linked through import aliases when read), and the compact catalogue set table.

ALTER TABLE "PersonRef"
  ADD COLUMN "catalogueName" TEXT,
  ADD COLUMN "nameSetByUser" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aka" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "birthYear" INTEGER,
  ADD COLUMN "nationality" TEXT,
  ADD COLUMN "catalogueDate" DATE,
  ADD COLUMN "goneFromCatalogueAt" TIMESTAMP(3),
  ADD COLUMN "searchNorm" TEXT;

-- A Contact created by hand is named by the user (ADR-0038, design: names)
UPDATE "PersonRef" SET "nameSetByUser" = true WHERE source = 'manual';

CREATE INDEX "PersonRef_searchNorm_trgm_idx" ON "PersonRef" USING gin ("searchNorm" gin_trgm_ops);

-- 228k rows: the natural key is the primary key (no surrogate id + second index)
CREATE TABLE "contact_channel_alias" (
    "contactId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasNorm" TEXT NOT NULL,
    CONSTRAINT "contact_channel_alias_pkey" PRIMARY KEY ("contactId","channelName","alias")
);
CREATE INDEX "contact_channel_alias_channelName_idx" ON "contact_channel_alias"("channelName");
CREATE INDEX "contact_channel_alias_aliasNorm_idx" ON "contact_channel_alias"("aliasNorm");
ALTER TABLE "contact_channel_alias" ADD CONSTRAINT "contact_channel_alias_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "PersonRef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "catalogue_set" (
    "coverId" TEXT NOT NULL,
    "date" DATE,
    "altDates" DATE[],
    "channelName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isVideo" BOOLEAN NOT NULL DEFAULT false,
    "castIcgIds" TEXT[],
    "disagreements" JSONB,
    CONSTRAINT "catalogue_set_pkey" PRIMARY KEY ("coverId")
);
CREATE INDEX "catalogue_set_date_idx" ON "catalogue_set"("date");
-- "Her sets": every catalogue set whose cast holds an ICG-ID
CREATE INDEX "catalogue_set_castIcgIds_gin_idx" ON "catalogue_set" USING gin ("castIcgIds");
