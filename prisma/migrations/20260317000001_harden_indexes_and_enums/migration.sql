-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DigitalIdentityStatus" AS ENUM ('active', 'inactive', 'suspended', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: Convert PersonDigitalIdentity.status from String to enum (data-preserving)
ALTER TABLE "PersonDigitalIdentity" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PersonDigitalIdentity"
  ALTER COLUMN "status" TYPE "DigitalIdentityStatus" USING "status"::"DigitalIdentityStatus";
ALTER TABLE "PersonDigitalIdentity" ALTER COLUMN "status" SET DEFAULT 'active'::"DigitalIdentityStatus";

-- CreateIndex: Missing FK indexes on join tables
CREATE INDEX "PersonAliasChannel_aliasId_idx" ON "PersonAliasChannel"("aliasId");
CREATE INDEX "LabelNetwork_networkId_idx" ON "LabelNetwork"("networkId");
CREATE INDEX "MediaCollectionItem_mediaItemId_idx" ON "MediaCollectionItem"("mediaItemId");
CREATE INDEX "SkillEventMedia_mediaItemId_idx" ON "SkillEventMedia"("mediaItemId");
