-- Dashboard (2026-10-11): when an archive folder was first found, and the runs the
-- agents report. Existing folders keep NULL — their discovery date is unknown.
ALTER TABLE "archive_folder" ADD COLUMN "discoveredAt" TIMESTAMP(3);
ALTER TABLE "archive_folder" ALTER COLUMN "discoveredAt" SET DEFAULT (now() AT TIME ZONE 'UTC');

CREATE TABLE "agent_run" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    CONSTRAINT "agent_run_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_run_agent_finishedAt_idx" ON "agent_run"("agent", "finishedAt");
