-- CreateTable
CREATE TABLE "orphaned_storage_key" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "orphaned_storage_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orphaned_storage_key_resolvedAt_idx" ON "orphaned_storage_key"("resolvedAt");
