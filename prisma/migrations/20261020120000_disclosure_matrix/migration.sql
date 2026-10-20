-- ADR-0035: Disclosure replaces Skills — the matrix catalog (situations ×
-- their own ladders of levels, plus settings) and entries on session
-- contributions. Skills stay until slice 5 carries their data over.

CREATE TABLE "DisclosureSituation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisclosureSituation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DisclosureSituation_name_key" ON "DisclosureSituation"("name");

CREATE TABLE "DisclosureLevel" (
    "id" TEXT NOT NULL,
    "situationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisclosureLevel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DisclosureLevel_situationId_name_key" ON "DisclosureLevel"("situationId", "name");
CREATE INDEX "DisclosureLevel_situationId_idx" ON "DisclosureLevel"("situationId");
ALTER TABLE "DisclosureLevel" ADD CONSTRAINT "DisclosureLevel_situationId_fkey"
    FOREIGN KEY ("situationId") REFERENCES "DisclosureSituation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DisclosureSetting" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisclosureSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DisclosureSetting_name_key" ON "DisclosureSetting"("name");

CREATE TABLE "DisclosureEntry" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "settingId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisclosureEntry_pkey" PRIMARY KEY ("id")
);
-- An entry without a setting is still one per (contribution, level)
CREATE UNIQUE INDEX "DisclosureEntry_contributionId_levelId_settingId_key"
    ON "DisclosureEntry"("contributionId", "levelId", "settingId") NULLS NOT DISTINCT;
CREATE INDEX "DisclosureEntry_levelId_idx" ON "DisclosureEntry"("levelId");
ALTER TABLE "DisclosureEntry" ADD CONSTRAINT "DisclosureEntry_contributionId_fkey"
    FOREIGN KEY ("contributionId") REFERENCES "SessionContribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisclosureEntry" ADD CONSTRAINT "DisclosureEntry_levelId_fkey"
    FOREIGN KEY ("levelId") REFERENCES "DisclosureLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DisclosureEntry" ADD CONSTRAINT "DisclosureEntry_settingId_fkey"
    FOREIGN KEY ("settingId") REFERENCES "DisclosureSetting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DisclosureEntryMedia" (
    "entryId" TEXT NOT NULL,
    "mediaItemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DisclosureEntryMedia_pkey" PRIMARY KEY ("entryId", "mediaItemId")
);
CREATE INDEX "DisclosureEntryMedia_mediaItemId_idx" ON "DisclosureEntryMedia"("mediaItemId");
ALTER TABLE "DisclosureEntryMedia" ADD CONSTRAINT "DisclosureEntryMedia_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "DisclosureEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisclosureEntryMedia" ADD CONSTRAINT "DisclosureEntryMedia_mediaItemId_fkey"
    FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The starting matrix (ADR-0035): six situations in order, no levels yet —
-- the user fills the ladders in Settings. Four settings, private → public.
INSERT INTO "DisclosureSituation" ("id", "name", "sortOrder") VALUES
  ('dsit-glamour', 'Glamour', 0),
  ('dsit-solo',    'Solo',    1),
  ('dsit-gg',      'G-G',     2),
  ('dsit-gb',      'G-B',     3),
  ('dsit-group',   'Group',   4),
  ('dsit-special', 'Special', 5);

INSERT INTO "DisclosureSetting" ("id", "name", "rank") VALUES
  ('dset-private',     'Private / studio',   0),
  ('dset-secluded',    'Secluded outdoors',  1),
  ('dset-semipublic',  'Semi-public',        2),
  ('dset-public',      'Public',             3);
