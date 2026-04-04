-- CreateIndex
CREATE UNIQUE INDEX "Channel_shortName_key" ON "Channel"("shortName") WHERE "shortName" IS NOT NULL;
