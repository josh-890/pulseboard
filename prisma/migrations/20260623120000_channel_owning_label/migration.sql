-- ADR-0020 Phase 1: add Channel.labelId owning FK + backfill from the
-- highest-confidence ChannelLabelMap (the deterministic formalization of the
-- old findFirst(confidence desc) / pickOwnerLabelId rule).

-- 1. Column + index
ALTER TABLE "Channel" ADD COLUMN "labelId" TEXT;
CREATE INDEX "Channel_labelId_idx" ON "Channel"("labelId");

-- 2. FK. Nullable relation → ON DELETE SET NULL (Prisma's default for optional
--    relations); deleting a Label nulls its owned channels' labelId.
ALTER TABLE "Channel"
  ADD CONSTRAINT "Channel_labelId_fkey"
  FOREIGN KEY ("labelId") REFERENCES "Label"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Backfill: owner = highest-confidence map per channel, tie-broken by labelId
--    ASC for determinism. Mirrors pickOwnerLabelId(). Channels with no map stay NULL.
UPDATE "Channel" c
SET "labelId" = sub."labelId"
FROM (
  SELECT DISTINCT ON ("channelId") "channelId", "labelId"
  FROM "ChannelLabelMap"
  ORDER BY "channelId", "confidence" DESC, "labelId" ASC
) sub
WHERE sub."channelId" = c."id";
