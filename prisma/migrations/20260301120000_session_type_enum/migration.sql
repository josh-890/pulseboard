-- 1. Create SessionType enum
CREATE TYPE "SessionType" AS ENUM ('REFERENCE', 'PRODUCTION');

-- 2. Add type column with default PRODUCTION
ALTER TABLE "Session" ADD COLUMN "type" "SessionType" NOT NULL DEFAULT 'PRODUCTION';

-- 3. Backfill: sessions with REFERENCE status → REFERENCE type
UPDATE "Session" SET "type" = 'REFERENCE' WHERE "status" = 'REFERENCE';

-- 4. Move those sessions to CONFIRMED status
UPDATE "Session" SET "status" = 'CONFIRMED' WHERE "status" = 'REFERENCE';

-- 5. Drop MV that depends on Session.status column type
DROP MATERIALIZED VIEW IF EXISTS mv_dashboard_stats;

-- 6. Swap SessionStatus enum (remove REFERENCE)
ALTER TABLE "Session" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "SessionStatus" RENAME TO "SessionStatus_old";
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'CONFIRMED');
ALTER TABLE "Session" ALTER COLUMN "status" TYPE "SessionStatus" USING "status"::text::"SessionStatus";
ALTER TABLE "Session" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "SessionStatus_old";

-- 7. Soft-delete then hard-delete all REFERENCE PersonMediaLinks (enum value being removed)
UPDATE "PersonMediaLink" SET "deletedAt" = NOW() WHERE "usage" = 'REFERENCE' AND "deletedAt" IS NULL;
DELETE FROM "PersonMediaLink" WHERE "usage" = 'REFERENCE';

-- 8. Swap PersonMediaUsage enum (remove REFERENCE)
ALTER TYPE "PersonMediaUsage" RENAME TO "PersonMediaUsage_old";
CREATE TYPE "PersonMediaUsage" AS ENUM ('PROFILE', 'HEADSHOT', 'BODY_MARK', 'BODY_MODIFICATION', 'COSMETIC_PROCEDURE', 'PORTFOLIO');
ALTER TABLE "PersonMediaLink" ALTER COLUMN "usage" TYPE "PersonMediaUsage" USING "usage"::text::"PersonMediaUsage";
DROP TYPE "PersonMediaUsage_old";

-- 9. Index on type
CREATE INDEX "Session_type_idx" ON "Session"("type");

-- 10. Recreate MV with type-based REFERENCE filter instead of status-based
CREATE MATERIALIZED VIEW mv_dashboard_stats AS
SELECT
  (SELECT count(*) FROM "Person" WHERE "deletedAt" IS NULL) AS "personCount",
  (SELECT count(*) FROM "Set" WHERE "deletedAt" IS NULL) AS "setCount",
  (SELECT count(*) FROM "Label" WHERE "deletedAt" IS NULL) AS "labelCount",
  (SELECT count(*) FROM "Channel" WHERE "deletedAt" IS NULL) AS "channelCount",
  (SELECT count(*) FROM "Project" WHERE "deletedAt" IS NULL) AS "projectCount",
  (SELECT count(*) FROM "MediaItem" WHERE "deletedAt" IS NULL) AS "mediaItemCount",
  (SELECT count(*) FROM "Session" WHERE "deletedAt" IS NULL AND "type" <> 'REFERENCE'::"SessionType") AS "sessionCount";
