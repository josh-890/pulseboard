-- Add trigram GIN indexes on normalized name fields (resolving drift)
CREATE INDEX IF NOT EXISTS "PersonAlias_nameNorm_idx" ON "PersonAlias"("nameNorm");
CREATE INDEX IF NOT EXISTS "Network_nameNorm_idx" ON "Network"("nameNorm");
CREATE INDEX IF NOT EXISTS "Label_nameNorm_idx" ON "Label"("nameNorm");
CREATE INDEX IF NOT EXISTS "Channel_nameNorm_idx" ON "Channel"("nameNorm");
CREATE INDEX IF NOT EXISTS "Project_nameNorm_idx" ON "Project"("nameNorm");
CREATE INDEX IF NOT EXISTS "Set_titleNorm_idx" ON "Set"("titleNorm");
CREATE INDEX IF NOT EXISTS "SetCreditRaw_rawNameNorm_idx" ON "SetCreditRaw"("rawNameNorm");

-- Make Set.sessionId optional
ALTER TABLE "Set" ALTER COLUMN "sessionId" DROP NOT NULL;
