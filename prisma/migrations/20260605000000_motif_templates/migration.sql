-- Motif templates: standardized, template-aligned slot images (headshot first).
-- Adds MotifTemplate (one per slot) + MediaItem normalization provenance, and
-- seeds the default Headshot template (slot 1, 2:3, eyes + mouth).

-- CreateTable
CREATE TABLE "MotifTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "aspectW" INTEGER NOT NULL,
    "aspectH" INTEGER NOT NULL,
    "bakeLongSide" INTEGER NOT NULL,
    "keypoints" JSONB NOT NULL,
    "silhouetteRef" TEXT,
    "minSourcePx" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MotifTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MotifTemplate_slot_key" ON "MotifTemplate"("slot");

-- AlterTable
ALTER TABLE "MediaItem" ADD COLUMN "motifTemplateId" TEXT,
ADD COLUMN "motifProvenance" JSONB;

-- CreateIndex
CREATE INDEX "MediaItem_motifTemplateId_idx" ON "MediaItem"("motifTemplateId");

-- AddForeignKey
ALTER TABLE "MediaItem" ADD CONSTRAINT "MediaItem_motifTemplateId_fkey" FOREIGN KEY ("motifTemplateId") REFERENCES "MotifTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default Headshot template (slot 1). 2:3 frame; eyes at 40% height, mouth at 62%.
INSERT INTO "MotifTemplate" ("id", "name", "slot", "aspectW", "aspectH", "bakeLongSide", "keypoints", "minSourcePx", "createdAt", "updatedAt")
VALUES (
    gen_random_uuid()::text,
    'Headshot',
    1,
    2,
    3,
    2048,
    '[{"name":"left_eye","x":0.38,"y":0.40},{"name":"right_eye","x":0.62,"y":0.40},{"name":"mouth","x":0.50,"y":0.62}]'::jsonb,
    900,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("slot") DO NOTHING;
