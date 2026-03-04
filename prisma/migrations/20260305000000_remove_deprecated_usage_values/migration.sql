-- Remove deprecated PersonMediaUsage enum values: BODY_MARK, BODY_MODIFICATION, COSMETIC_PROCEDURE
-- These have been replaced by the DETAIL usage with categoryId

-- PostgreSQL doesn't support ALTER TYPE ... DROP VALUE, so we must recreate the enum

-- 1. Rename old enum
ALTER TYPE "PersonMediaUsage" RENAME TO "PersonMediaUsage_old";

-- 2. Create new enum without deprecated values
CREATE TYPE "PersonMediaUsage" AS ENUM ('PROFILE', 'HEADSHOT', 'DETAIL', 'PORTFOLIO');

-- 3. Alter column to use new enum
ALTER TABLE "PersonMediaLink"
  ALTER COLUMN "usage" TYPE "PersonMediaUsage"
  USING "usage"::text::"PersonMediaUsage";

-- 4. Drop old enum
DROP TYPE "PersonMediaUsage_old";
