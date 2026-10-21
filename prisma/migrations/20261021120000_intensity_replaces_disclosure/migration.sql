-- ADR-0036: Intensity replaces Disclosure. The disclosure catalog (no entries
-- were ever made) is carried over: situations → scenarios, levels → acts with
-- proposed intensity levels, settings → the extra group "Location". Then
-- "First time" and "Max" are added and the Disclosure tables dropped.

CREATE TYPE "ActExtraMode" AS ENUM ('ADD', 'DROP');

CREATE TABLE "IntensityScenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntensityScenario_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntensityScenario_name_key" ON "IntensityScenario"("name");

CREATE TABLE "IntensityAct" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntensityAct_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntensityAct_scenarioId_name_key" ON "IntensityAct"("scenarioId", "name");
CREATE INDEX "IntensityAct_scenarioId_idx" ON "IntensityAct"("scenarioId");
ALTER TABLE "IntensityAct" ADD CONSTRAINT "IntensityAct_scenarioId_fkey"
    FOREIGN KEY ("scenarioId") REFERENCES "IntensityScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IntensityExtraGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntensityExtraGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntensityExtraGroup_name_key" ON "IntensityExtraGroup"("name");

CREATE TABLE "IntensityExtra" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "groupId" TEXT,
    "isMax" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntensityExtra_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntensityExtra_name_key" ON "IntensityExtra"("name");
-- Exactly one Max at most
CREATE UNIQUE INDEX "IntensityExtra_one_max" ON "IntensityExtra"("isMax") WHERE "isMax";
ALTER TABLE "IntensityExtra" ADD CONSTRAINT "IntensityExtra_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "IntensityExtraGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ContributionExtra" (
    "contributionId" TEXT NOT NULL,
    "extraId" TEXT NOT NULL,
    CONSTRAINT "ContributionExtra_pkey" PRIMARY KEY ("contributionId", "extraId")
);
CREATE INDEX "ContributionExtra_extraId_idx" ON "ContributionExtra"("extraId");
ALTER TABLE "ContributionExtra" ADD CONSTRAINT "ContributionExtra_contributionId_fkey"
    FOREIGN KEY ("contributionId") REFERENCES "SessionContribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContributionExtra" ADD CONSTRAINT "ContributionExtra_extraId_fkey"
    FOREIGN KEY ("extraId") REFERENCES "IntensityExtra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContributionAct" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "actId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContributionAct_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContributionAct_contributionId_actId_key" ON "ContributionAct"("contributionId", "actId");
CREATE INDEX "ContributionAct_actId_idx" ON "ContributionAct"("actId");
ALTER TABLE "ContributionAct" ADD CONSTRAINT "ContributionAct_contributionId_fkey"
    FOREIGN KEY ("contributionId") REFERENCES "SessionContribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContributionAct" ADD CONSTRAINT "ContributionAct_actId_fkey"
    FOREIGN KEY ("actId") REFERENCES "IntensityAct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ContributionActExtra" (
    "contributionActId" TEXT NOT NULL,
    "extraId" TEXT NOT NULL,
    "mode" "ActExtraMode" NOT NULL,
    CONSTRAINT "ContributionActExtra_pkey" PRIMARY KEY ("contributionActId", "extraId")
);
CREATE INDEX "ContributionActExtra_extraId_idx" ON "ContributionActExtra"("extraId");
ALTER TABLE "ContributionActExtra" ADD CONSTRAINT "ContributionActExtra_contributionActId_fkey"
    FOREIGN KEY ("contributionActId") REFERENCES "ContributionAct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContributionActExtra" ADD CONSTRAINT "ContributionActExtra_extraId_fkey"
    FOREIGN KEY ("extraId") REFERENCES "IntensityExtra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Carry the disclosure catalog over ───────────────────────────────────────

INSERT INTO "IntensityScenario" ("id", "name", "sortOrder", "createdAt")
SELECT "id", "name", "sortOrder", "createdAt" FROM "DisclosureSituation";

-- The example Glamour ladder gets proposed levels; any other level its rank
INSERT INTO "IntensityAct" ("id", "scenarioId", "name", "description", "level", "createdAt")
SELECT l."id", l."situationId", l."name", l."description",
       COALESCE(p.level, l."rank"), l."createdAt"
FROM "DisclosureLevel" l
LEFT JOIN (VALUES
  ('dlvl-glam-0', 0.5), ('dlvl-glam-1', 1.0), ('dlvl-glam-2', 1.5),
  ('dlvl-glam-3', 2.5), ('dlvl-glam-4', 3.0), ('dlvl-glam-5', 4.0),
  ('dlvl-glam-6', 5.0), ('dlvl-glam-7', 6.0), ('dlvl-glam-8', 7.0)
) AS p(id, level) ON p.id = l."id";

INSERT INTO "IntensityExtraGroup" ("id", "name", "sortOrder") VALUES ('ixg-location', 'Location', 0);

INSERT INTO "IntensityExtra" ("id", "name", "points", "groupId", "sortOrder")
SELECT s."id", s."name",
       CASE s."id" WHEN 'dset-secluded' THEN 0.5 WHEN 'dset-semipublic' THEN 1 WHEN 'dset-public' THEN 2 ELSE 0 END,
       'ixg-location', s."rank"
FROM "DisclosureSetting" s;

INSERT INTO "IntensityExtra" ("id", "name", "points", "isMax", "sortOrder") VALUES
  ('ix-first-time', 'First time', 1, false, 100),
  ('ix-max',        'Max',        0, true,  101)
ON CONFLICT ("name") DO NOTHING;

-- ─── Drop Disclosure ─────────────────────────────────────────────────────────

DROP TABLE "DisclosureEntryMedia";
DROP TABLE "DisclosureEntry";
DROP TABLE "DisclosureLevel";
DROP TABLE "DisclosureSetting";
DROP TABLE "DisclosureSituation";
