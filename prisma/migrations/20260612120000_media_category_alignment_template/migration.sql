-- Generalised alignment binding (ADR-0014): a MediaCategory may carry exactly one
-- Alignment Template (code model MotifTemplate). Locus categories (Eyes, a pose, a
-- headshot framing) opt in → alignable + cross-person Atlas grid; entity-collection
-- categories (Tattoos, Scars, Piercings…) leave it null → plain organisational
-- buckets (unchanged behaviour).
--
-- 0:1 each way: `@unique` so one template backs at most one category. SetNull on
-- delete: removing a template demotes its category to a plain bucket rather than
-- cascading. The legacy profile-slot path (MotifTemplate.slot @unique) is untouched
-- here — slots are folded into categories in the later unification slice.

ALTER TABLE "MediaCategory"
  ADD COLUMN "alignmentTemplateId" TEXT;

CREATE UNIQUE INDEX "MediaCategory_alignmentTemplateId_key"
  ON "MediaCategory" ("alignmentTemplateId");

ALTER TABLE "MediaCategory"
  ADD CONSTRAINT "MediaCategory_alignmentTemplateId_fkey"
    FOREIGN KEY ("alignmentTemplateId") REFERENCES "MotifTemplate"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
