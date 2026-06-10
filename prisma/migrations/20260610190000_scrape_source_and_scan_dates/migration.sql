-- Watchlist scan-round workflow: per-identity-page scan dating + scrape-source registry.

-- Per-source line format for generated URL files.
CREATE TYPE "ScrapeLineFormat" AS ENUM ('URL_ONLY', 'ICGID_URL');

-- Per-identity-page scan dating.
ALTER TABLE "PersonDigitalIdentity" ADD COLUMN "scannedThroughAt" TIMESTAMP(3);
ALTER TABLE "PersonDigitalIdentity" ADD COLUMN "excludeFromScan" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "PersonDigitalIdentity_scannedThroughAt_idx" ON "PersonDigitalIdentity"("scannedThroughAt");

-- Scrape-source registry.
CREATE TABLE "ScrapeSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isScannable" BOOLEAN NOT NULL DEFAULT false,
    "fileName" TEXT NOT NULL DEFAULT '',
    "lineFormat" "ScrapeLineFormat" NOT NULL DEFAULT 'ICGID_URL',
    "urlPattern" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScrapeSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScrapeSource_key_key" ON "ScrapeSource"("key");
CREATE INDEX "ScrapeSource_isScannable_idx" ON "ScrapeSource"("isScannable");
