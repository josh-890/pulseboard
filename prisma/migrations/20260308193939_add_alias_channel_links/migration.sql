-- AlterTable
ALTER TABLE "PersonAlias" ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "PersonAliasChannel" (
    "aliasId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "PersonAliasChannel_pkey" PRIMARY KEY ("aliasId","channelId")
);

-- CreateIndex
CREATE INDEX "PersonAliasChannel_channelId_idx" ON "PersonAliasChannel"("channelId");

-- AddForeignKey
ALTER TABLE "PersonAliasChannel" ADD CONSTRAINT "PersonAliasChannel_aliasId_fkey" FOREIGN KEY ("aliasId") REFERENCES "PersonAlias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonAliasChannel" ADD CONSTRAINT "PersonAliasChannel_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
