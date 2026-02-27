-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'session_added';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "nameNorm" TEXT;

-- CreateTable
CREATE TABLE "SetSession" (
    "setId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetSession_pkey" PRIMARY KEY ("setId","sessionId")
);

-- CreateIndex
CREATE INDEX "Session_nameNorm_idx" ON "Session"("nameNorm");

-- AddForeignKey
ALTER TABLE "SetSession" ADD CONSTRAINT "SetSession_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetSession" ADD CONSTRAINT "SetSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
