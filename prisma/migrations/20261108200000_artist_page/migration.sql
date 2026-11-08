-- Artist page (2026-11-08): website, your rating and notes (bio = About), and
-- the other names an artist is credited under.
ALTER TABLE "Artist" ADD COLUMN "website" TEXT, ADD COLUMN "rating" INTEGER, ADD COLUMN "notes" TEXT;

CREATE TABLE "artist_alias" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasNorm" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "artist_alias_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "artist_alias_artistId_aliasNorm_key" ON "artist_alias"("artistId", "aliasNorm");
CREATE INDEX "artist_alias_aliasNorm_idx" ON "artist_alias"("aliasNorm");
ALTER TABLE "artist_alias" ADD CONSTRAINT "artist_alias_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
