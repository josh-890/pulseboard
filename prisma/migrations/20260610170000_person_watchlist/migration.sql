-- Person watchlist: monitor a person for new sets to import (orthogonal to status).
CREATE TYPE "WatchPriority" AS ENUM ('HIGH', 'NORMAL', 'LOW');

ALTER TABLE "Person" ADD COLUMN "watching" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Person" ADD COLUMN "watchPriority" "WatchPriority" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "Person" ADD COLUMN "watchNote" TEXT;
ALTER TABLE "Person" ADD COLUMN "watchSourceUrl" TEXT;
ALTER TABLE "Person" ADD COLUMN "watchCheckedAt" TIMESTAMP(3);

CREATE INDEX "Person_watching_idx" ON "Person"("watching");
