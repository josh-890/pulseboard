-- Track which PersonAlias was used in a SetCreditRaw resolution
ALTER TABLE "SetCreditRaw" ADD COLUMN "resolvedAliasId" TEXT;
CREATE INDEX "SetCreditRaw_resolvedAliasId_idx" ON "SetCreditRaw"("resolvedAliasId");
ALTER TABLE "SetCreditRaw" ADD CONSTRAINT "SetCreditRaw_resolvedAliasId_fkey"
  FOREIGN KEY ("resolvedAliasId") REFERENCES "PersonAlias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Track which PersonAlias was used in a SessionContribution (credited name)
ALTER TABLE "SessionContribution" ADD COLUMN "resolvedAliasId" TEXT;
CREATE INDEX "SessionContribution_resolvedAliasId_idx" ON "SessionContribution"("resolvedAliasId");
ALTER TABLE "SessionContribution" ADD CONSTRAINT "SessionContribution_resolvedAliasId_fkey"
  FOREIGN KEY ("resolvedAliasId") REFERENCES "PersonAlias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
