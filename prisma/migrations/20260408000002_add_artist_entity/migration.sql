-- CreateTable
CREATE TABLE "Artist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "nationality" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

-- Add resolvedArtistId to SetCreditRaw
ALTER TABLE "SetCreditRaw" ADD COLUMN "resolvedArtistId" TEXT;

-- CreateIndex
CREATE INDEX "Artist_nameNorm_idx" ON "Artist"("nameNorm");

-- CreateIndex
CREATE INDEX "SetCreditRaw_resolvedArtistId_idx" ON "SetCreditRaw"("resolvedArtistId");

-- AddForeignKey
ALTER TABLE "SetCreditRaw" ADD CONSTRAINT "SetCreditRaw_resolvedArtistId_fkey" FOREIGN KEY ("resolvedArtistId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
